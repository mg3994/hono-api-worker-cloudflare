import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessagingService } from '../services/messagingService';
import { IGoogleAuthService } from '../services/googleAuthService';
import { ISessionRepository } from '../domain/sessionRepository';
import { PushNotificationPayload } from '../domain/messagingService';

describe('FCM MessagingService Unit Tests', () => {
  const mockGoogleAuthService = (): IGoogleAuthService => ({
    getAccessToken: vi.fn().mockResolvedValue('mock_google_oauth_token'),
  });

  const mockSessionRepository = (): ISessionRepository => ({
    syncDeviceSession: vi.fn(),
    logoutDevice: vi.fn(),
    getSessionsByUid: vi.fn(),
    getFCMTokensByUid: vi.fn().mockResolvedValue(['fcm_token_1', 'fcm_token_2']),
    getAllFCMTokens: vi.fn().mockResolvedValue(['token_a', 'token_b', 'token_c']),
  });

  it('should compile the FCM REST v1 message payload structure with deep link options', () => {
    const googleAuth = mockGoogleAuthService();
    const sessionRepo = mockSessionRepository();
    const service = new MessagingService(googleAuth, sessionRepo, 'test-project');

    const payload: PushNotificationPayload = {
      title: 'Alert title',
      body: 'Alert body text',
      imageUrl: 'https://example.com/image.png',
      deepLinkUrl: 'https://example.com/deeplink-route',
      customData: {
        shopId: 'shop_123',
      },
    };

    const compiled = (service as any).compileFcmPayload('mock_token', payload);

    expect(compiled.message.token).toBe('mock_token');
    expect(compiled.message.notification.title).toBe('Alert title');
    expect(compiled.message.notification.body).toBe('Alert body text');
    expect(compiled.message.notification.image).toBe('https://example.com/image.png');

    // Conforms to deep-linking SW resolution click URL patterns
    expect(compiled.message.data.url).toBe('https://example.com/deeplink-route');
    expect(compiled.message.data.shopId).toBe('shop_123');

    // Conforms to native webpush link parameters
    expect(compiled.message.webpush.fcm_options.link).toBe('https://example.com/deeplink-route');
  });

  it('should dispatch push notifications to all resolved user devices', async () => {
    const googleAuth = mockGoogleAuthService();
    const sessionRepo = mockSessionRepository();
    const service = new MessagingService(googleAuth, sessionRepo, 'test-project');

    // Spy on global fetch
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '{"name":"projects/test-project/messages/12345"}',
    } as any);

    const payload: PushNotificationPayload = {
      title: 'Hi',
      body: 'How are you?',
    };

    const result = await service.sendNotificationToUser('user_123', payload);

    expect(sessionRepo.getFCMTokensByUid).toHaveBeenCalledWith('user_123');
    expect(googleAuth.getAccessToken).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2); // Sent to both 'fcm_token_1' and 'fcm_token_2'
    expect(result.successCount).toBe(2);
    expect(result.failures.length).toBe(0);

    fetchSpy.mockRestore();
  });

  it('should handle single vs multiple token dispatch sequences inside sendNotificationToTokens', async () => {
    const googleAuth = mockGoogleAuthService();
    const sessionRepo = mockSessionRepository();
    const service = new MessagingService(googleAuth, sessionRepo, 'test-project');

    // Spy on global fetch
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '{}',
    } as any);

    const payload: PushNotificationPayload = {
      title: 'Hi',
      body: 'How are you?',
    };

    // 1. Single Token Dispatch
    const singleResult = await service.sendNotificationToTokens(['fcm_single_token'], payload);
    expect(singleResult.successCount).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 2. Multi Token Dispatch
    fetchSpy.mockClear();
    const multiResult = await service.sendNotificationToTokens(['token_1', 'token_2', 'token_3'], payload);
    expect(multiResult.successCount).toBe(3);
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    fetchSpy.mockRestore();
  });

  it('should dispatch push notifications to all registered device sessions inside sendNotificationToAllUsers', async () => {
    const googleAuth = mockGoogleAuthService();
    const sessionRepo = mockSessionRepository();
    const service = new MessagingService(googleAuth, sessionRepo, 'test-project');

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '{}',
    } as any);

    const payload: PushNotificationPayload = {
      title: 'System Update',
      body: 'Maintenance starting in 15 minutes',
    };

    const result = await service.sendNotificationToAllUsers(payload);

    expect(sessionRepo.getAllFCMTokens).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(3); // Registered 'token_a', 'token_b', and 'token_c'
    expect(result.successCount).toBe(3);

    fetchSpy.mockRestore();
  });
});
