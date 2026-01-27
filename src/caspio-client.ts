/**
 * Caspio REST API Client
 * Handles authentication and all API operations for Caspio databases
 */

export interface CaspioConfig {
  baseUrl: string;      // e.g., "https://c1abc123.caspio.com"
  clientId: string;
  clientSecret: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

export interface TableField {
  Name: string;
  Type: string;
  Unique: boolean;
  UniqueAllowNulls: boolean;
  Label: string;
  Description: string;
  DisplayOrder: number;
  OnInsert: boolean;
  OnUpdate: boolean;
  TimeZone: string;
  Format: string;
  Prefix: string;
  Length: number;
  IsFormula: boolean;
  ListField: any;
}

export interface TableDefinition {
  Name: string;
  Note: string;
  Columns: TableField[];
}

export interface ViewDefinition {
  Name: string;
  Note: string;
  Columns: TableField[];
}

export interface RecordResult {
  Result: Record<string, any>[];
  RecordsAffected?: number;
}

export interface QueryOptions {
  select?: string;
  where?: string;
  orderBy?: string;
  groupBy?: string;
  limit?: number;
  pageNumber?: number;
  pageSize?: number;
}

export class CaspioClient {
  private config: CaspioConfig;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(config: CaspioConfig) {
    this.config = config;
  }

  /**
   * Get the token endpoint URL
   */
  private get tokenEndpoint(): string {
    return `${this.config.baseUrl}/oauth/token`;
  }

  /**
   * Get the API base URL (v2)
   */
  private get apiBase(): string {
    return `${this.config.baseUrl}/rest/v2`;
  }

  /**
   * Authenticate with Caspio using OAuth 2.0 client credentials flow
   */
  async authenticate(): Promise<void> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Authentication failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as TokenResponse;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000);
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available. Please authenticate first.');
    }

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
    });

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      // If refresh fails, try full authentication
      await this.authenticate();
      return;
    }

    const data = await response.json() as TokenResponse;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000);
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken || !this.tokenExpiry) {
      await this.authenticate();
      return;
    }

    // Refresh if token expires in less than 5 minutes
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    if (this.tokenExpiry < fiveMinutesFromNow) {
      await this.refreshAccessToken();
    }
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: any,
    queryParams?: Record<string, string>
  ): Promise<T> {
    await this.ensureAuthenticated();

    let url = `${this.apiBase}${endpoint}`;

    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams(queryParams);
      url += `?${params.toString()}`;
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text);
  }

  // ==================== Tables API ====================

  /**
   * List all tables in the Caspio account
   */
  async listTables(): Promise<string[]> {
    const result = await this.request<{ Result: string[] }>('GET', '/tables');
    return result.Result || [];
  }

  /**
   * Get the definition/schema of a table
   */
  async getTableDefinition(tableName: string): Promise<TableDefinition> {
    const result = await this.request<{ Result: TableDefinition }>(
      'GET',
      `/tables/${encodeURIComponent(tableName)}`
    );
    return result.Result;
  }

  /**
   * Create a new table
   */
  async createTable(definition: {
    Name: string;
    Note?: string;
    Columns: Array<{
      Name: string;
      Type: string;
      Unique?: boolean;
      Description?: string;
      Length?: number;
    }>;
  }): Promise<void> {
    await this.request('POST', '/tables', definition);
  }

  /**
   * Delete a table
   */
  async deleteTable(tableName: string): Promise<void> {
    await this.request('DELETE', `/tables/${encodeURIComponent(tableName)}`);
  }

  /**
   * Get all field definitions for a table
   */
  async getTableFields(tableName: string): Promise<TableField[]> {
    const result = await this.request<{ Result: TableField[] }>(
      'GET',
      `/tables/${encodeURIComponent(tableName)}/fields`
    );
    return result.Result || [];
  }

  /**
   * Get field definition for a specific field in a table
   */
  async getFieldDefinition(tableName: string, fieldName: string): Promise<TableField> {
    const result = await this.request<{ Result: TableField }>(
      'GET',
      `/tables/${encodeURIComponent(tableName)}/fields/${encodeURIComponent(fieldName)}`
    );
    return result.Result;
  }

  /**
   * Add a field to a table
   */
  async addField(
    tableName: string,
    field: {
      Name: string;
      Type: string;
      Unique?: boolean;
      Description?: string;
      Length?: number;
    }
  ): Promise<void> {
    await this.request(
      'POST',
      `/tables/${encodeURIComponent(tableName)}/fields`,
      field
    );
  }

  /**
   * Delete a field from a table
   */
  async deleteField(tableName: string, fieldName: string): Promise<void> {
    await this.request(
      'DELETE',
      `/tables/${encodeURIComponent(tableName)}/fields/${encodeURIComponent(fieldName)}`
    );
  }

  // ==================== Records API ====================

  /**
   * Get records from a table with optional filtering
   */
  async getRecords(
    tableName: string,
    options: QueryOptions = {}
  ): Promise<Record<string, any>[]> {
    const queryParams: Record<string, string> = {};

    if (options.select) {
      queryParams['q.select'] = options.select;
    }
    if (options.where) {
      queryParams['q.where'] = options.where;
    }
    if (options.orderBy) {
      queryParams['q.orderBy'] = options.orderBy;
    }
    if (options.groupBy) {
      queryParams['q.groupBy'] = options.groupBy;
    }
    if (options.limit) {
      queryParams['q.limit'] = options.limit.toString();
    }
    if (options.pageNumber) {
      queryParams['q.pageNumber'] = options.pageNumber.toString();
    }
    if (options.pageSize) {
      queryParams['q.pageSize'] = options.pageSize.toString();
    }

    const result = await this.request<{ Result: Record<string, any>[] }>(
      'GET',
      `/tables/${encodeURIComponent(tableName)}/records`,
      undefined,
      queryParams
    );
    return result.Result || [];
  }

  /**
   * Get all records from a table (handles pagination automatically)
   */
  async getAllRecords(
    tableName: string,
    options: Omit<QueryOptions, 'pageNumber' | 'pageSize' | 'limit'> = {}
  ): Promise<Record<string, any>[]> {
    const allRecords: Record<string, any>[] = [];
    let pageNumber = 1;
    const pageSize = 1000; // Max allowed by Caspio

    while (true) {
      const records = await this.getRecords(tableName, {
        ...options,
        pageNumber,
        pageSize,
      });

      allRecords.push(...records);

      if (records.length < pageSize) {
        break;
      }
      pageNumber++;
    }

    return allRecords;
  }

  /**
   * Create a new record in a table
   */
  async createRecord(
    tableName: string,
    record: Record<string, any>
  ): Promise<Record<string, any>> {
    const result = await this.request<{ Result: Record<string, any> }>(
      'POST',
      `/tables/${encodeURIComponent(tableName)}/records`,
      record,
      { response: 'rows' }
    );
    return result.Result;
  }

  /**
   * Create multiple records in a table
   */
  async createRecords(
    tableName: string,
    records: Record<string, any>[]
  ): Promise<Record<string, any>[]> {
    const result = await this.request<{ Result: Record<string, any>[] }>(
      'POST',
      `/tables/${encodeURIComponent(tableName)}/records`,
      records,
      { response: 'rows' }
    );
    return result.Result || [];
  }

  /**
   * Update records matching a WHERE clause
   */
  async updateRecords(
    tableName: string,
    updates: Record<string, any>,
    where: string
  ): Promise<number> {
    const result = await this.request<{ RecordsAffected: number }>(
      'PUT',
      `/tables/${encodeURIComponent(tableName)}/records`,
      updates,
      { 'q.where': where }
    );
    return result.RecordsAffected || 0;
  }

  /**
   * Delete records matching a WHERE clause
   */
  async deleteRecords(tableName: string, where: string): Promise<number> {
    const result = await this.request<{ RecordsAffected: number }>(
      'DELETE',
      `/tables/${encodeURIComponent(tableName)}/records`,
      undefined,
      { 'q.where': where }
    );
    return result.RecordsAffected || 0;
  }

  // ==================== Views API ====================

  /**
   * List all views in the Caspio account
   */
  async listViews(): Promise<string[]> {
    const result = await this.request<{ Result: string[] }>('GET', '/views');
    return result.Result || [];
  }

  /**
   * Get the definition/schema of a view
   */
  async getViewDefinition(viewName: string): Promise<ViewDefinition> {
    const result = await this.request<{ Result: ViewDefinition }>(
      'GET',
      `/views/${encodeURIComponent(viewName)}`
    );
    return result.Result;
  }

  /**
   * Get records from a view with optional filtering
   */
  async getViewRecords(
    viewName: string,
    options: QueryOptions = {}
  ): Promise<Record<string, any>[]> {
    const queryParams: Record<string, string> = {};

    if (options.select) {
      queryParams['q.select'] = options.select;
    }
    if (options.where) {
      queryParams['q.where'] = options.where;
    }
    if (options.orderBy) {
      queryParams['q.orderBy'] = options.orderBy;
    }
    if (options.groupBy) {
      queryParams['q.groupBy'] = options.groupBy;
    }
    if (options.limit) {
      queryParams['q.limit'] = options.limit.toString();
    }
    if (options.pageNumber) {
      queryParams['q.pageNumber'] = options.pageNumber.toString();
    }
    if (options.pageSize) {
      queryParams['q.pageSize'] = options.pageSize.toString();
    }

    const result = await this.request<{ Result: Record<string, any>[] }>(
      'GET',
      `/views/${encodeURIComponent(viewName)}/records`,
      undefined,
      queryParams
    );
    return result.Result || [];
  }

  // ==================== Applications API ====================

  /**
   * List all applications
   */
  async listApplications(): Promise<any[]> {
    const result = await this.request<{ Result: any[] }>('GET', '/applications');
    return result.Result || [];
  }

  /**
   * Get application properties
   */
  async getApplication(appName: string): Promise<any> {
    const result = await this.request<{ Result: any }>(
      'GET',
      `/applications/${encodeURIComponent(appName)}`
    );
    return result.Result;
  }

  // ==================== Files API ====================

  /**
   * List files in a folder
   */
  async listFiles(folderPath: string = '/'): Promise<any[]> {
    const result = await this.request<{ Result: any[] }>(
      'GET',
      `/files/${encodeURIComponent(folderPath)}`
    );
    return result.Result || [];
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(filePath: string): Promise<any> {
    const result = await this.request<{ Result: any }>(
      'GET',
      `/files/${encodeURIComponent(filePath)}/metadata`
    );
    return result.Result;
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<void> {
    await this.request('DELETE', `/files/${encodeURIComponent(filePath)}`);
  }

  // ==================== Tasks API ====================

  /**
   * List all scheduled tasks
   */
  async listTasks(): Promise<any[]> {
    const result = await this.request<{ Result: any[] }>('GET', '/tasks');
    return result.Result || [];
  }

  /**
   * Get task properties
   */
  async getTask(taskName: string): Promise<any> {
    const result = await this.request<{ Result: any }>(
      'GET',
      `/tasks/${encodeURIComponent(taskName)}`
    );
    return result.Result;
  }

  /**
   * Run a scheduled task
   */
  async runTask(taskName: string): Promise<void> {
    await this.request('POST', `/tasks/${encodeURIComponent(taskName)}/run`);
  }

  // ==================== Directories API (v3) ====================

  /**
   * Get the API base URL for v3
   */
  private get apiBaseV3(): string {
    return `${this.config.baseUrl}/integrations/rest/v3`;
  }

  /**
   * Make an authenticated API request to v3 endpoints
   */
  private async requestV3<T>(
    method: string,
    endpoint: string,
    body?: any,
    queryParams?: Record<string, string>
  ): Promise<T> {
    await this.ensureAuthenticated();

    let url = `${this.apiBaseV3}${endpoint}`;

    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams(queryParams);
      url += `?${params.toString()}`;
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text);
  }

  /**
   * List all directories
   */
  async listDirectories(): Promise<any[]> {
    const result = await this.requestV3<{ Result: any[] }>('GET', '/directories');
    return result.Result || [];
  }

  /**
   * Get directory details
   */
  async getDirectory(directoryName: string): Promise<any> {
    const result = await this.requestV3<{ Result: any }>(
      'GET',
      `/directories/${encodeURIComponent(directoryName)}`
    );
    return result.Result;
  }

  /**
   * List users in a directory
   */
  async listDirectoryUsers(directoryName: string, options: QueryOptions = {}): Promise<any[]> {
    const queryParams: Record<string, string> = {};

    if (options.select) {
      queryParams['q.select'] = options.select;
    }
    if (options.where) {
      queryParams['q.where'] = options.where;
    }
    if (options.orderBy) {
      queryParams['q.orderBy'] = options.orderBy;
    }
    if (options.limit) {
      queryParams['q.limit'] = options.limit.toString();
    }
    if (options.pageNumber) {
      queryParams['q.pageNumber'] = options.pageNumber.toString();
    }
    if (options.pageSize) {
      queryParams['q.pageSize'] = options.pageSize.toString();
    }

    const result = await this.requestV3<{ Result: any[] }>(
      'GET',
      `/directories/${encodeURIComponent(directoryName)}/users`,
      undefined,
      queryParams
    );
    return result.Result || [];
  }

  /**
   * Get a specific user from a directory
   */
  async getDirectoryUser(directoryName: string, externalKey: string): Promise<any> {
    const result = await this.requestV3<{ Result: any }>(
      'GET',
      `/directories/${encodeURIComponent(directoryName)}/users/${encodeURIComponent(externalKey)}`
    );
    return result.Result;
  }

  /**
   * Create a user in a directory
   */
  async createDirectoryUser(directoryName: string, user: Record<string, any>): Promise<any> {
    const result = await this.requestV3<{ Result: any }>(
      'POST',
      `/directories/${encodeURIComponent(directoryName)}/users`,
      user
    );
    return result.Result;
  }

  /**
   * Update a user in a directory
   */
  async updateDirectoryUser(
    directoryName: string,
    externalKey: string,
    updates: Record<string, any>
  ): Promise<any> {
    const result = await this.requestV3<{ Result: any }>(
      'PUT',
      `/directories/${encodeURIComponent(directoryName)}/users/${encodeURIComponent(externalKey)}`,
      updates
    );
    return result.Result;
  }

  /**
   * Delete a user from a directory
   */
  async deleteDirectoryUser(directoryName: string, externalKey: string): Promise<void> {
    await this.requestV3(
      'DELETE',
      `/directories/${encodeURIComponent(directoryName)}/users/${encodeURIComponent(externalKey)}`
    );
  }

  /**
   * Activate a user in a directory
   */
  async activateDirectoryUser(directoryName: string, externalKey: string): Promise<void> {
    await this.requestV3(
      'POST',
      `/directories/${encodeURIComponent(directoryName)}/users/${encodeURIComponent(externalKey)}/activate`
    );
  }

  /**
   * Deactivate a user in a directory
   */
  async deactivateDirectoryUser(directoryName: string, externalKey: string): Promise<void> {
    await this.requestV3(
      'POST',
      `/directories/${encodeURIComponent(directoryName)}/users/${encodeURIComponent(externalKey)}/deactivate`
    );
  }

  /**
   * Authenticate a user against a directory
   * Returns user data if authentication is successful, throws error otherwise
   */
  async authenticateDirectoryUser(
    directoryName: string,
    username: string,
    password: string
  ): Promise<any> {
    const result = await this.requestV3<{ Result: any }>(
      'POST',
      `/directories/${encodeURIComponent(directoryName)}/users/authenticate`,
      { username, password }
    );
    return result.Result;
  }

  // ==================== Utility Methods ====================

  /**
   * Test the connection to Caspio
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      await this.listTables();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get account information summary
   */
  async getAccountSummary(): Promise<{
    tables: string[];
    views: string[];
    applications: any[];
  }> {
    const [tables, views, applications] = await Promise.all([
      this.listTables(),
      this.listViews(),
      this.listApplications(),
    ]);

    return {
      tables,
      views,
      applications,
    };
  }
}
