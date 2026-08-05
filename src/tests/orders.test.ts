import { describe, it, expect, vi } from 'vitest';
import { CreateOrderUseCase } from '../usecases/createOrderUseCase';
import { GetOrdersUseCase } from '../usecases/getOrdersUseCase';
import { ProcessPaymentUseCase } from '../usecases/processPaymentUseCase';
import { RefundPaymentUseCase } from '../usecases/refundPaymentUseCase';
import { IOrderRepository, Order } from '../domain/orderRepository';
import { IPaymentRepository, Payment } from '../domain/paymentRepository';
import { UserContext } from '../domain/types';
import { PermissionDeniedError, ValidationError } from '../domain/errors';
import app from '../index';
import { mockEnv } from './testUtils';

describe('Orders & Payments Use Cases', () => {
  const mockOrderRepo = (): IOrderRepository => ({
    createOrder: vi.fn(),
    getOrderById: vi.fn(),
    getOrdersByBusiness: vi.fn(),
    getAllOrders: vi.fn(),
    updateOrderStatus: vi.fn(),
  });

  const mockPaymentRepo = (): IPaymentRepository => ({
    createPayment: vi.fn(),
    getPaymentsByOrder: vi.fn(),
    getPaymentById: vi.fn(),
    updatePaymentStatus: vi.fn(),
  });

  describe('CreateOrderUseCase', () => {
    it('should successfully create an order if caller has an active role in the business', async () => {
      const orderRepo = mockOrderRepo();
      const useCase = new CreateOrderUseCase(orderRepo);

      const caller: UserContext = {
        uid: 'user_staff',
        email: 'staff@example.com',
        isSuperAdmin: false,
        claims: { s: ['biz_123'], o: [], m: [] },
      };

      const result = await useCase.execute(caller, {
        businessId: 'biz_123',
        amount: 250.5,
      });

      expect(result.id).toContain('ord_');
      expect(result.businessId).toBe('biz_123');
      expect(result.amount).toBe(250.5);
      expect(result.status).toBe('pending');
      expect(orderRepo.createOrder).toHaveBeenCalled();
    });

    it('should allow Super Admins to create orders for any business', async () => {
      const orderRepo = mockOrderRepo();
      const useCase = new CreateOrderUseCase(orderRepo);

      const caller: UserContext = {
        uid: 'super_admin',
        email: 'admin@example.com',
        isSuperAdmin: true,
        claims: { o: [], m: [], s: [] },
      };

      const result = await useCase.execute(caller, {
        businessId: 'any_biz_id',
        amount: 1000,
      });

      expect(result.businessId).toBe('any_biz_id');
      expect(result.status).toBe('pending');
      expect(orderRepo.createOrder).toHaveBeenCalled();
    });

    it('should throw PermissionDeniedError if caller does not have a role in the business', async () => {
      const orderRepo = mockOrderRepo();
      const useCase = new CreateOrderUseCase(orderRepo);

      const caller: UserContext = {
        uid: 'user_unauthorized',
        email: 'intruder@example.com',
        isSuperAdmin: false,
        claims: { o: ['another_biz'], m: [], s: [] },
      };

      await expect(
        useCase.execute(caller, {
          businessId: 'biz_123',
          amount: 50,
        })
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('GetOrdersUseCase', () => {
    it('should retrieve orders for a specific business if caller is authorized', async () => {
      const orderRepo = mockOrderRepo();
      const useCase = new GetOrdersUseCase(orderRepo);

      const mockOrders: Order[] = [
        { id: 'ord_1', uid: 'user_1', businessId: 'biz_123', amount: 100, status: 'pending', createdAt: Date.now() },
      ];
      vi.spyOn(orderRepo, 'getOrdersByBusiness').mockResolvedValue(mockOrders);

      const caller: UserContext = {
        uid: 'user_moderator',
        email: 'mod@example.com',
        isSuperAdmin: false,
        claims: { m: ['biz_123'], o: [], s: [] },
      };

      const result = await useCase.execute(caller, 'biz_123');
      expect(result).toEqual(mockOrders);
      expect(orderRepo.getOrdersByBusiness).toHaveBeenCalledWith('biz_123');
    });

    it('should allow Super Admins to retrieve all orders globally', async () => {
      const orderRepo = mockOrderRepo();
      const useCase = new GetOrdersUseCase(orderRepo);

      const mockOrders: Order[] = [
        { id: 'ord_1', uid: 'user_1', businessId: 'biz_1', amount: 100, status: 'pending', createdAt: Date.now() },
        { id: 'ord_2', uid: 'user_2', businessId: 'biz_2', amount: 200, status: 'completed', createdAt: Date.now() },
      ];
      vi.spyOn(orderRepo, 'getAllOrders').mockResolvedValue(mockOrders);

      const caller: UserContext = {
        uid: 'super_admin',
        email: 'admin@example.com',
        isSuperAdmin: true,
        claims: { o: [], m: [], s: [] },
      };

      const result = await useCase.execute(caller);
      expect(result).toEqual(mockOrders);
      expect(orderRepo.getAllOrders).toHaveBeenCalled();
    });

    it('should block non-super admins from retrieving all orders globally', async () => {
      const orderRepo = mockOrderRepo();
      const useCase = new GetOrdersUseCase(orderRepo);

      const caller: UserContext = {
        uid: 'user_owner',
        email: 'owner@example.com',
        isSuperAdmin: false,
        claims: { o: ['biz_1'], m: [], s: [] },
      };

      await expect(useCase.execute(caller)).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('ProcessPaymentUseCase', () => {
    it('should successfully pay for a pending order and update status to completed', async () => {
      const orderRepo = mockOrderRepo();
      const paymentRepo = mockPaymentRepo();
      const useCase = new ProcessPaymentUseCase(orderRepo, paymentRepo);

      const mockOrder: Order = {
        id: 'ord_123',
        uid: 'user_1',
        businessId: 'biz_123',
        amount: 500,
        status: 'pending',
        createdAt: Date.now(),
      };

      vi.spyOn(orderRepo, 'getOrderById').mockResolvedValue(mockOrder);
      vi.spyOn(paymentRepo, 'createPayment').mockResolvedValue();
      vi.spyOn(orderRepo, 'updateOrderStatus').mockResolvedValue();

      const caller: UserContext = {
        uid: 'user_owner',
        email: 'owner@example.com',
        isSuperAdmin: false,
        claims: { o: ['biz_123'], m: [], s: [] },
      };

      const result = await useCase.execute(caller, {
        orderId: 'ord_123',
        amount: 500,
        method: 'crypto',
      });

      expect(result.id).toContain('pay_');
      expect(result.status).toBe('succeeded');
      expect(result.method).toBe('crypto');
      expect(paymentRepo.createPayment).toHaveBeenCalled();
      expect(orderRepo.updateOrderStatus).toHaveBeenCalledWith('ord_123', 'completed');
    });

    it('should throw ValidationError if the order is already completed', async () => {
      const orderRepo = mockOrderRepo();
      const paymentRepo = mockPaymentRepo();
      const useCase = new ProcessPaymentUseCase(orderRepo, paymentRepo);

      const mockOrder: Order = {
        id: 'ord_123',
        uid: 'user_1',
        businessId: 'biz_123',
        amount: 500,
        status: 'completed',
        createdAt: Date.now(),
      };

      vi.spyOn(orderRepo, 'getOrderById').mockResolvedValue(mockOrder);

      const caller: UserContext = {
        uid: 'user_owner',
        email: 'owner@example.com',
        isSuperAdmin: false,
        claims: { o: ['biz_123'], m: [], s: [] },
      };

      await expect(
        useCase.execute(caller, {
          orderId: 'ord_123',
          amount: 500,
          method: 'card',
        })
      ).rejects.toThrow(ValidationError);
    });

    it('should successfully process Google Pay UPI / Tez payment with transaction identifiers', async () => {
      const orderRepo = mockOrderRepo();
      const paymentRepo = mockPaymentRepo();
      const useCase = new ProcessPaymentUseCase(orderRepo, paymentRepo);

      const mockOrder: Order = {
        id: 'ord_gp1',
        uid: 'user_1',
        businessId: 'biz_123',
        amount: 200,
        status: 'pending',
        createdAt: Date.now(),
      };

      vi.spyOn(orderRepo, 'getOrderById').mockResolvedValue(mockOrder);
      vi.spyOn(paymentRepo, 'createPayment').mockResolvedValue();
      vi.spyOn(orderRepo, 'updateOrderStatus').mockResolvedValue();

      const caller: UserContext = {
        uid: 'user_owner',
        email: 'owner@example.com',
        isSuperAdmin: false,
        claims: { o: ['biz_123'], m: [], s: [] },
      };

      const result = await useCase.execute(caller, {
        orderId: 'ord_gp1',
        amount: 200,
        method: 'google_pay',
        googlePayPayload: {
          paymentMethodData: {
            tokenizationData: {
              token: JSON.stringify({
                tezResponse: {
                  ApprovalRefNo: 'REF1234567890',
                  txnId: 'TXN-998877',
                  responseCode: '00',
                },
              }),
            },
          },
        },
      });

      expect(result.status).toBe('succeeded');
      expect(result.method).toBe('google_pay');
      expect(result.gatewayReferenceId).toBe('REF1234567890');
      expect(result.bankReferenceId).toBe('REF1234567890');
      expect(result.networkTransactionId).toBe('TXN-998877');
    });
  });

  describe('RefundPaymentUseCase', () => {
    it('should successfully execute a partial refund and transition order to partially_refunded', async () => {
      const orderRepo = mockOrderRepo();
      const paymentRepo = mockPaymentRepo();
      const useCase = new RefundPaymentUseCase(orderRepo, paymentRepo);

      const mockOrder: Order = {
        id: 'ord_refund',
        uid: 'user_1',
        businessId: 'biz_123',
        amount: 1000,
        status: 'completed',
        createdAt: Date.now(),
      };

      const mockPayment: Payment = {
        id: 'pay_refund',
        orderId: 'ord_refund',
        amount: 1000,
        method: 'card',
        status: 'succeeded',
        createdAt: Date.now(),
      };

      vi.spyOn(orderRepo, 'getOrderById').mockResolvedValue(mockOrder);
      vi.spyOn(paymentRepo, 'getPaymentById').mockResolvedValue(mockPayment);
      vi.spyOn(paymentRepo, 'getPaymentsByOrder').mockResolvedValue([mockPayment]);
      vi.spyOn(paymentRepo, 'updatePaymentStatus').mockResolvedValue();
      vi.spyOn(orderRepo, 'updateOrderStatus').mockResolvedValue();

      const caller: UserContext = {
        uid: 'user_owner',
        email: 'owner@example.com',
        isSuperAdmin: false,
        claims: { o: ['biz_123'], m: [], s: [] },
      };

      const result = await useCase.execute(caller, {
        orderId: 'ord_refund',
        paymentId: 'pay_refund',
        amount: 400,
        reason: 'Faulty items',
      });

      expect(result.status).toBe('partially_refunded');
      expect(paymentRepo.updatePaymentStatus).toHaveBeenCalledWith('pay_refund', 'partially_refunded');
      expect(orderRepo.updateOrderStatus).toHaveBeenCalledWith('ord_refund', 'partially_refunded');
    });

    it('should successfully execute a full refund and transition order to fully_refunded', async () => {
      const orderRepo = mockOrderRepo();
      const paymentRepo = mockPaymentRepo();
      const useCase = new RefundPaymentUseCase(orderRepo, paymentRepo);

      const mockOrder: Order = {
        id: 'ord_refund_full',
        uid: 'user_1',
        businessId: 'biz_123',
        amount: 1000,
        status: 'completed',
        createdAt: Date.now(),
      };

      const mockPayment: Payment = {
        id: 'pay_refund_full',
        orderId: 'ord_refund_full',
        amount: 1000,
        method: 'card',
        status: 'succeeded',
        createdAt: Date.now(),
      };

      vi.spyOn(orderRepo, 'getOrderById').mockResolvedValue(mockOrder);
      vi.spyOn(paymentRepo, 'getPaymentById').mockResolvedValue(mockPayment);
      vi.spyOn(paymentRepo, 'getPaymentsByOrder').mockResolvedValue([mockPayment]);
      vi.spyOn(paymentRepo, 'updatePaymentStatus').mockResolvedValue();
      vi.spyOn(orderRepo, 'updateOrderStatus').mockResolvedValue();

      const caller: UserContext = {
        uid: 'user_owner',
        email: 'owner@example.com',
        isSuperAdmin: false,
        claims: { o: ['biz_123'], m: [], s: [] },
      };

      const result = await useCase.execute(caller, {
        orderId: 'ord_refund_full',
        paymentId: 'pay_refund_full',
        amount: 1000,
        reason: 'Customer returned all items',
      });

      expect(result.status).toBe('refunded');
      expect(paymentRepo.updatePaymentStatus).toHaveBeenCalledWith('pay_refund_full', 'refunded');
      expect(orderRepo.updateOrderStatus).toHaveBeenCalledWith('ord_refund_full', 'fully_refunded');
    });
  });
});

describe('Orders & Payments Hono Routes Integration Tests', () => {
  it('should block POST /api/orders with 401 Unauthorized if request is unauthenticated', async () => {
    const payload = {
      businessId: 'biz_123',
      amount: 150,
    };

    const response = await app.request('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, mockEnv);

    expect(response.status).toBe(401);
    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should block GET /api/orders with 401 Unauthorized if request is unauthenticated', async () => {
    const response = await app.request('/api/orders?businessId=biz_123', undefined, mockEnv);
    expect(response.status).toBe(401);
  });

  it('should block POST /api/payments/process with 401 Unauthorized if request is unauthenticated', async () => {
    const payload = {
      orderId: 'ord_123',
      amount: 100,
      method: 'card',
    };

    const response = await app.request('/api/payments/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, mockEnv);

    expect(response.status).toBe(401);
  });
});
