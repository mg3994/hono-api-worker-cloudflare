import { IOrderRepository, Order } from '../domain/orderRepository';

export class OrderRepository implements IOrderRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  public async createOrder(order: Order): Promise<void> {
    const query = 'INSERT INTO orders (id, uid, business_id, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?)';
    await this.db
      .prepare(query)
      .bind(order.id, order.uid, order.businessId, order.amount, order.status, order.createdAt)
      .run();
  }

  public async getOrderById(id: string): Promise<Order | null> {
    const query = 'SELECT id, uid, business_id as businessId, amount, status, created_at as createdAt FROM orders WHERE id = ?';
    const row = await this.db.prepare(query).bind(id).first<any>();
    if (!row) return null;

    return {
      id: row.id,
      uid: row.uid,
      businessId: row.businessId,
      amount: row.amount,
      status: row.status as any,
      createdAt: row.createdAt,
    };
  }

  public async getOrdersByBusiness(businessId: string): Promise<Order[]> {
    const query = 'SELECT id, uid, business_id as businessId, amount, status, created_at as createdAt FROM orders WHERE business_id = ? ORDER BY created_at DESC';
    const result = await this.db.prepare(query).bind(businessId).all<any>();
    return (result.results || []).map((row) => ({
      id: row.id,
      uid: row.uid,
      businessId: row.businessId,
      amount: row.amount,
      status: row.status as any,
      createdAt: row.createdAt,
    }));
  }

  public async getAllOrders(): Promise<Order[]> {
    const query = 'SELECT id, uid, business_id as businessId, amount, status, created_at as createdAt FROM orders ORDER BY created_at DESC';
    const result = await this.db.prepare(query).all<any>();
    return (result.results || []).map((row) => ({
      id: row.id,
      uid: row.uid,
      businessId: row.businessId,
      amount: row.amount,
      status: row.status as any,
      createdAt: row.createdAt,
    }));
  }

  public async updateOrderStatus(id: string, status: 'pending' | 'completed' | 'cancelled'): Promise<void> {
    const query = 'UPDATE orders SET status = ? WHERE id = ?';
    await this.db.prepare(query).bind(status, id).run();
  }
}
