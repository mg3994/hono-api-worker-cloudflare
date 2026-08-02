export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  method: 'card' | 'bank' | 'crypto';
  status: 'initiated' | 'succeeded' | 'failed';
  createdAt: number;
}

export interface IPaymentRepository {
  createPayment(payment: Payment): Promise<void>;
  getPaymentsByOrder(orderId: string): Promise<Payment[]>;
}
