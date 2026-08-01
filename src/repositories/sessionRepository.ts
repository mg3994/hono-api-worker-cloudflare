import { ISessionRepository, DeviceSessionRecord } from '../domain/sessionRepository';

export class SessionRepository implements ISessionRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Persists or updates the device session record (FCM token, browser ID, UID) inside D1.
   */
  public async syncDeviceSession(session: DeviceSessionRecord): Promise<void> {
    const query = `
      INSERT INTO user_device_sessions (browser_client_id, uid, device_token, client_name, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(browser_client_id) DO UPDATE SET
        uid = excluded.uid,
        device_token = excluded.device_token,
        client_name = excluded.client_name,
        updated_at = excluded.updated_at
    `;

    await this.db
      .prepare(query)
      .bind(
        session.browserClientId,
        session.uid,
        session.deviceToken,
        session.clientName,
        session.updatedAt
      )
      .run();
  }

  /**
   * Removes or marks as logged out the device session for a specific browserClientId.
   */
  public async logoutDevice(browserClientId: string): Promise<void> {
    const query = 'DELETE FROM user_device_sessions WHERE browser_client_id = ?';
    await this.db.prepare(query).bind(browserClientId).run();
  }

  /**
   * Fetches the device sessions associated with a specific user ID.
   */
  public async getSessionsByUid(uid: string): Promise<DeviceSessionRecord[]> {
    const query = 'SELECT browser_client_id as browserClientId, uid, device_token as deviceToken, client_name as clientName, updated_at as updatedAt FROM user_device_sessions WHERE uid = ?';
    const result = await this.db.prepare(query).bind(uid).all<any>();

    return (result.results || []).map((row) => ({
      browserClientId: row.browserClientId,
      uid: row.uid,
      deviceToken: row.deviceToken,
      clientName: row.clientName,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * Retrieves all active remote FCM device tokens associated with a given Firebase UID.
   */
  public async getFCMTokensByUid(uid: string): Promise<string[]> {
    const query = 'SELECT device_token as deviceToken FROM user_device_sessions WHERE uid = ?';
    const result = await this.db.prepare(query).bind(uid).all<{ deviceToken: string }>();

    return (result.results || []).map((row) => row.deviceToken);
  }

  /**
   * Retrieves all unique active FCM device tokens registered in the system.
   */
  public async getAllFCMTokens(): Promise<string[]> {
    const query = 'SELECT DISTINCT device_token as deviceToken FROM user_device_sessions';
    const result = await this.db.prepare(query).all<{ deviceToken: string }>();

    return (result.results || []).map((row) => row.deviceToken);
  }
}
