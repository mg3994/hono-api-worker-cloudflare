export interface Order {
  id: string;
  uid: string;
  businessId: string;
  amount: number;
  status: 'pending' | 'completed' | 'cancelled' | 'partially_paid';
  createdAt: number;
}

export interface IOrderRepository {
  createOrder(order: Order): Promise<void>;
  getOrderById(id: string): Promise<Order | null>;
  getOrdersByBusiness(businessId: string, limit?: number, offset?: number): Promise<Order[]>;
  getAllOrders(limit?: number, offset?: number): Promise<Order[]>;
  updateOrderStatus(id: string, status: 'pending' | 'completed' | 'cancelled' | 'partially_paid'): Promise<void>;
}
