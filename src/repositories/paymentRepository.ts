import { IPaymentRepository, Payment } from '../domain/paymentRepository';

export class PaymentRepository implements IPaymentRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  public async createPayment(payment: Payment): Promise<void> {
    const query = 'INSERT INTO payments (id, order_id, amount, method, status, created_at) VALUES (?, ?, ?, ?, ?, ?)';
    await this.db
      .prepare(query)
      .bind(payment.id, payment.orderId, payment.amount, payment.method, payment.status, payment.createdAt)
      .run();
  }

  public async getPaymentsByOrder(orderId: string): Promise<Payment[]> {
    const query = 'SELECT id, order_id as orderId, amount, method, status, created_at as createdAt FROM payments WHERE order_id = ? ORDER BY created_at DESC';
    const result = await this.db.prepare(query).bind(orderId).all<any>();
    return (result.results || []).map((row) => ({
      id: row.id,
      orderId: row.orderId,
      amount: row.amount,
      method: row.method as any,
      status: row.status as any,
      createdAt: row.createdAt,
    }));
  }

  public async getPaymentById(id: string): Promise<Payment | null> {
    const query = 'SELECT id, order_id as orderId, amount, method, status, created_at as createdAt FROM payments WHERE id = ?';
    const result = await this.db.prepare(query).bind(id).first<any>();
    if (!result) return null;
    return {
      id: result.id,
      orderId: result.orderId,
      amount: result.amount,
      method: result.method as any,
      status: result.status as any,
      createdAt: result.createdAt,
    };
  }

  public async updatePaymentStatus(id: string, status: 'initiated' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded'): Promise<void> {
    const query = 'UPDATE payments SET status = ? WHERE id = ?';
    await this.db.prepare(query).bind(status, id).run();
  }
}
