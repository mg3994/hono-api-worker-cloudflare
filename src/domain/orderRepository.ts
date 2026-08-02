export interface Order {
  id: string;
  uid: string;
  businessId: string;
  amount: number;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: number;
}

export interface IOrderRepository {
  createOrder(order: Order): Promise<void>;
  getOrderById(id: string): Promise<Order | null>;
  getOrdersByBusiness(businessId: string): Promise<Order[]>;
  getAllOrders(): Promise<Order[]>;
  updateOrderStatus(id: string, status: 'pending' | 'completed' | 'cancelled'): Promise<void>;
}
