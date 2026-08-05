import { IOrderRepository } from '../domain/orderRepository';
import { IPaymentRepository, Payment } from '../domain/paymentRepository';
import { RefundPaymentRequest, UserContext } from '../domain/types';
import { PermissionDeniedError, ValidationError } from '../domain/errors';

export class RefundPaymentUseCase {
  private orderRepo: IOrderRepository;
  private paymentRepo: IPaymentRepository;

  constructor(orderRepo: IOrderRepository, paymentRepo: IPaymentRepository) {
    this.orderRepo = orderRepo;
    this.paymentRepo = paymentRepo;
  }

  /**
   * Processes a refund for an existing payment.
   * - Validates that the payment and order exist.
   * - Checks that the caller is Super Admin, or Owner/Manager of the business.
   * - Marks the payment as fully or partially refunded.
   * - Dynamically transitions the order status based on total refund amount vs order amount.
   */
  async execute(caller: UserContext, request: RefundPaymentRequest): Promise<Payment> {
    const { orderId, paymentId, amount } = request;

    // Fetch the order
    const order = await this.orderRepo.getOrderById(orderId);
    if (!order) {
      throw new ValidationError(`Order with ID "${orderId}" was not found.`);
    }

    // Verify permissions
    const businessId = order.businessId;
    const isSuperAdmin = caller.isSuperAdmin;
    const isOwnerOrManager =
      caller.claims?.o?.includes(businessId) ||
      caller.claims?.m?.includes(businessId) ||
      false;

    if (!isSuperAdmin && !isOwnerOrManager) {
      throw new PermissionDeniedError('Permission denied: Only Super Admins, Business Owners, or Managers can initiate refunds.');
    }

    // Fetch the payment
    const payment = await this.paymentRepo.getPaymentById(paymentId);
    if (!payment) {
      throw new ValidationError(`Payment with ID "${paymentId}" was not found.`);
    }

    if (payment.orderId !== orderId) {
      throw new ValidationError('Payment does not belong to the specified order.');
    }

    if (payment.status !== 'succeeded' && payment.status !== 'completed' && payment.status !== 'partially_refunded') {
      throw new ValidationError(`Payment with status "${payment.status}" cannot be refunded.`);
    }

    if (amount > payment.amount) {
      throw new ValidationError('Refund amount cannot exceed the original payment amount.');
    }

    // Determine refund status
    const isFullRefund = amount === payment.amount;
    const newPaymentStatus = isFullRefund ? 'refunded' : 'partially_refunded';

    // Update payment status in DB
    await this.paymentRepo.updatePaymentStatus(paymentId, newPaymentStatus);

    // Update order status in DB based on remaining total paid amount
    const allPayments = await this.paymentRepo.getPaymentsByOrder(orderId) || [];
    // Calculate total remaining paid amount
    const totalRemainingPaid = allPayments
      .filter((p) => p.id !== paymentId && (p.status === 'succeeded' || p.status === 'completed'))
      .reduce((sum, p) => sum + p.amount, 0) + (isFullRefund ? 0 : payment.amount - amount);

    if (totalRemainingPaid <= 0) {
      await this.orderRepo.updateOrderStatus(orderId, 'fully_refunded');
    } else {
      await this.orderRepo.updateOrderStatus(orderId, 'partially_refunded');
    }

    // Return updated payment object
    return {
      ...payment,
      status: newPaymentStatus,
    };
  }
}
