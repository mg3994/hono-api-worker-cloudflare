import { IOrderRepository, Order } from '../domain/orderRepository';
import { CreateOrderRequest, UserContext } from '../domain/types';
import { PermissionDeniedError } from '../domain/errors';

export class CreateOrderUseCase {
  private orderRepo: IOrderRepository;

  constructor(orderRepo: IOrderRepository) {
    this.orderRepo = orderRepo;
  }

  /**
   * Creates an order for a business ID.
   * Access Controls: Super Admins, or any user associated with the target business (Owner 'o', Moderator 'm', Staff 's').
   */
  async execute(caller: UserContext, request: CreateOrderRequest): Promise<Order> {
    const { businessId, amount } = request;

    const isSuperAdmin = caller.isSuperAdmin;
    const isAssociated =
      caller.claims?.o?.includes(businessId) ||
      caller.claims?.m?.includes(businessId) ||
      caller.claims?.s?.includes(businessId) ||
      false;

    if (!isSuperAdmin && !isAssociated) {
      throw new PermissionDeniedError('Permission denied: You must have an active role in this business to create orders.');
    }

    const order: Order = {
      id: `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      uid: caller.uid,
      businessId,
      amount,
      status: 'pending',
      createdAt: Date.now(),
    };

    await this.orderRepo.createOrder(order);
    return order;
  }
}
