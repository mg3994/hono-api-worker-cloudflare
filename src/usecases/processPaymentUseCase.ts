import { IOrderRepository } from '../domain/orderRepository';
import { IPaymentRepository, Payment } from '../domain/paymentRepository';
import { ProcessPaymentRequest, UserContext } from '../domain/types';
import { PermissionDeniedError, ValidationError } from '../domain/errors';

export class ProcessPaymentUseCase {
  private orderRepo: IOrderRepository;
  private paymentRepo: IPaymentRepository;

  constructor(orderRepo: IOrderRepository, paymentRepo: IPaymentRepository) {
    this.orderRepo = orderRepo;
    this.paymentRepo = paymentRepo;
  }

  /**
   * Processes standard payment for an order and sets status to 'completed'.
   * Access Controls: Super Admins, or any user associated with the target business of the order.
   */
  async execute(caller: UserContext, request: ProcessPaymentRequest): Promise<Payment> {
    const { orderId, amount, method } = request;

    // Fetch order first
    const order = await this.orderRepo.getOrderById(orderId);
    if (!order) {
      throw new ValidationError(`Order with ID "${orderId}" was not found.`);
    }

    // Verify permissions on the order's business ID
    const businessId = order.businessId;
    const isSuperAdmin = caller.isSuperAdmin;
    const isAssociated =
      caller.claims?.o?.includes(businessId) ||
      caller.claims?.m?.includes(businessId) ||
      caller.claims?.s?.includes(businessId) ||
      false;

    if (!isSuperAdmin && !isAssociated) {
      throw new PermissionDeniedError('Permission denied: You must have an active role in this business to process payments for its orders.');
    }

    // Check current order status
    if (order.status !== 'pending') {
      throw new ValidationError(`Order with ID "${orderId}" cannot be paid because its current status is "${order.status}".`);
    }

    // Extract rich transaction identifiers
    let gatewayReferenceId: string | undefined = undefined;
    let bankReferenceId: string | undefined = undefined;
    let networkTransactionId: string | undefined = undefined;

    // Google Pay Parsing (Tez UPI / Web Pay)
    if (method === 'google_pay' && request.googlePayPayload) {
      const gpay = request.googlePayPayload;
      const tokenStr = gpay.paymentMethodData?.tokenizationData?.token;
      if (tokenStr) {
        try {
          const parsed = JSON.parse(tokenStr);
          if (parsed && parsed.tezResponse) {
            gatewayReferenceId = parsed.tezResponse.ApprovalRefNo;
            bankReferenceId = parsed.tezResponse.ApprovalRefNo;
            networkTransactionId = parsed.tezResponse.txnId;
          }
        } catch (err) {
          // Graceful ignore
        }
      }
    }

    // Apple Pay Parsing
    if (method === 'apple_pay' && request.applePayPayload) {
      const apay = request.applePayPayload;
      networkTransactionId = apay.token?.transactionIdentifier;
    }

    // Gateway Response Parsing (RRN/ARN)
    if (request.gatewayResponse) {
      const gw = request.gatewayResponse;
      gatewayReferenceId = gatewayReferenceId || gw.id || gw.authorization_code;
      bankReferenceId = bankReferenceId || gw.receipt_number;
      networkTransactionId = networkTransactionId || gw.network_transaction_id;
    }

    // Create Payment log
    const payment: Payment = {
      id: `pay_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      orderId,
      amount,
      method,
      status: 'succeeded',
      createdAt: Date.now(),
      gatewayReferenceId,
      bankReferenceId,
      networkTransactionId,
    };

    // Save payment log
    await this.paymentRepo.createPayment(payment);

    // Dynamic Multi-Payment Transitions: Fetch existing payments
    const existingPayments = await this.paymentRepo.getPaymentsByOrder(orderId) || [];
    const totalPaid = existingPayments
      .filter((p) => p.status === 'succeeded' || p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0) + amount;

    if (totalPaid >= order.amount) {
      await this.orderRepo.updateOrderStatus(orderId, 'completed');
    } else {
      await this.orderRepo.updateOrderStatus(orderId, 'partially_paid');
    }

    return payment;
  }
}
