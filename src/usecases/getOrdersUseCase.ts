import { IOrderRepository, Order } from '../domain/orderRepository';
import { UserContext } from '../domain/types';
import { PermissionDeniedError } from '../domain/errors';

export class GetOrdersUseCase {
  private orderRepo: IOrderRepository;

  constructor(orderRepo: IOrderRepository) {
    this.orderRepo = orderRepo;
  }

  /**
   * Retrieves orders.
   * - Super Admins can fetch all orders globally (if businessId is omitted) or per business.
   * - Non-super admins must supply a businessId and have a valid role in that business.
   */
  async execute(caller: UserContext, businessId?: string): Promise<Order[]> {
    const isSuperAdmin = caller.isSuperAdmin;

    if (!businessId) {
      if (!isSuperAdmin) {
        throw new PermissionDeniedError('Permission denied: Only Super Admins can fetch all orders globally.');
      }
      return this.orderRepo.getAllOrders();
    }

    const isAssociated =
      caller.claims?.o?.includes(businessId) ||
      caller.claims?.m?.includes(businessId) ||
      caller.claims?.s?.includes(businessId) ||
      false;

    if (!isSuperAdmin && !isAssociated) {
      throw new PermissionDeniedError('Permission denied: You must have an active role in this business to view its orders.');
    }

    return this.orderRepo.getOrdersByBusiness(businessId);
  }
}
