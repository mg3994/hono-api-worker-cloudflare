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
}
