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

    // Create Payment log
    const payment: Payment = {
      id: `pay_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      orderId,
      amount,
      method,
      status: 'succeeded',
      createdAt: Date.now(),
    };

    // Save payment log
    await this.paymentRepo.createPayment(payment);

    // Update Order status to completed
    await this.orderRepo.updateOrderStatus(orderId, 'completed');

    return payment;
  }
}
