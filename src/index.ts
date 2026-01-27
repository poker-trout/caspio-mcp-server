#!/usr/bin/env node
/**
 * Caspio MCP Server
 *
 * A Model Context Protocol server that provides AI agents with access to
 * Caspio databases, tables, views, and records.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CaspioClient, CaspioConfig, QueryOptions } from './caspio-client.js';

// ==================== Configuration ====================

function parseArgs(): {
  baseUrl?: string;
  clientId?: string;
  clientSecret?: string;
} {
  const args = process.argv.slice(2);
  const config: {
    baseUrl?: string;
    clientId?: string;
    clientSecret?: string;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg === '--base-url' && nextArg) {
      config.baseUrl = nextArg;
      i++;
    } else if (arg === '--client-id' && nextArg) {
      config.clientId = nextArg;
      i++;
    } else if (arg === '--client-secret' && nextArg) {
      config.clientSecret = nextArg;
      i++;
    } else if (arg.startsWith('--base-url=')) {
      config.baseUrl = arg.split('=')[1];
    } else if (arg.startsWith('--client-id=')) {
      config.clientId = arg.split('=')[1];
    } else if (arg.startsWith('--client-secret=')) {
      config.clientSecret = arg.split('=')[1];
    }
  }

  return config;
}

function getConfig(): CaspioConfig {
  // Priority: 1. Command-line args, 2. Environment variables
  const args = parseArgs();

  const baseUrl = args.baseUrl || process.env.CASPIO_BASE_URL;
  const clientId = args.clientId || process.env.CASPIO_CLIENT_ID;
  const clientSecret = args.clientSecret || process.env.CASPIO_CLIENT_SECRET;

  if (!baseUrl || !clientId || !clientSecret) {
    throw new Error(
      'Missing required configuration.\n\n' +
      'Option 1 - Command-line arguments:\n' +
      '  --base-url <url>        Caspio base URL (e.g., https://c1abc123.caspio.com)\n' +
      '  --client-id <id>        API Client ID\n' +
      '  --client-secret <secret> API Client Secret\n\n' +
      'Option 2 - Environment variables:\n' +
      '  CASPIO_BASE_URL\n' +
      '  CASPIO_CLIENT_ID\n' +
      '  CASPIO_CLIENT_SECRET'
    );
  }

  return { baseUrl, clientId, clientSecret };
}

// ==================== Schema Definitions ====================

const QueryOptionsSchema = z.object({
  select: z.string().optional().describe('Comma-separated list of fields to select'),
  where: z.string().optional().describe('WHERE clause for filtering (e.g., "Status=\'Active\' AND Age>21")'),
  orderBy: z.string().optional().describe('ORDER BY clause (e.g., "Name ASC" or "Date DESC")'),
  groupBy: z.string().optional().describe('GROUP BY clause'),
  limit: z.number().optional().describe('Maximum number of records to return (max 1000)'),
  pageNumber: z.number().optional().describe('Page number for pagination'),
  pageSize: z.number().optional().describe('Page size for pagination (max 1000)'),
});

const FieldDefinitionSchema = z.object({
  Name: z.string().describe('Field name'),
  Type: z.enum([
    'STRING', 'TEXT', 'NUMBER', 'INTEGER', 'CURRENCY',
    'DATE/TIME', 'YES/NO', 'FILE', 'TIMESTAMP', 'RANDOM ID',
    'AUTONUMBER', 'PREFIXED AUTONUMBER', 'GUID', 'PASSWORD', 'LIST-STRING',
    'LIST-NUMBER', 'LIST-DATE/TIME'
  ]).describe('Field data type'),
  Unique: z.boolean().optional().describe('Whether field values must be unique'),
  Description: z.string().optional().describe('Field description'),
  Length: z.number().optional().describe('Maximum length for STRING fields'),
});

// ==================== Tool Definitions ====================

const TOOLS = [
  // Tables Tools
  {
    name: 'caspio_list_tables',
    description: 'List all tables in the Caspio account',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'caspio_get_table_schema',
    description: 'Get the schema/definition of a specific table including all field definitions',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table',
        },
      },
      required: ['tableName'],
    },
  },
  {
    name: 'caspio_create_table',
    description: 'Create a new table in Caspio',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Name of the new table',
        },
        note: {
          type: 'string',
          description: 'Description/note for the table',
        },
        columns: {
          type: 'array',
          description: 'Array of column definitions',
          items: {
            type: 'object',
            properties: {
              Name: { type: 'string' },
              Type: { type: 'string' },
              Unique: { type: 'boolean' },
              Description: { type: 'string' },
              Length: { type: 'number' },
            },
            required: ['Name', 'Type'],
          },
        },
      },
      required: ['name', 'columns'],
    },
  },
  {
    name: 'caspio_delete_table',
    description: 'Delete a table from Caspio (USE WITH CAUTION)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table to delete',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm deletion',
        },
      },
      required: ['tableName', 'confirm'],
    },
  },
  {
    name: 'caspio_add_field',
    description: 'Add a new field/column to an existing table',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table',
        },
        field: {
          type: 'object',
          description: 'Field definition',
          properties: {
            Name: { type: 'string' },
            Type: { type: 'string' },
            Unique: { type: 'boolean' },
            Description: { type: 'string' },
            Length: { type: 'number' },
          },
          required: ['Name', 'Type'],
        },
      },
      required: ['tableName', 'field'],
    },
  },
  {
    name: 'caspio_delete_field',
    description: 'Delete a field/column from a table (USE WITH CAUTION)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table',
        },
        fieldName: {
          type: 'string',
          description: 'Name of the field to delete',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm deletion',
        },
      },
      required: ['tableName', 'fieldName', 'confirm'],
    },
  },

  // Records Tools
  {
    name: 'caspio_get_records',
    description: 'Get records from a table with optional filtering, sorting, and pagination',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table',
        },
        select: {
          type: 'string',
          description: 'Comma-separated list of fields to select',
        },
        where: {
          type: 'string',
          description: 'WHERE clause for filtering (e.g., "Status=\'Active\' AND Age>21")',
        },
        orderBy: {
          type: 'string',
          description: 'ORDER BY clause (e.g., "Name ASC" or "Date DESC")',
        },
        groupBy: {
          type: 'string',
          description: 'GROUP BY clause',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of records to return (max 1000)',
        },
        pageNumber: {
          type: 'number',
          description: 'Page number for pagination',
        },
        pageSize: {
          type: 'number',
          description: 'Page size for pagination (max 1000)',
        },
      },
      required: ['tableName'],
    },
  },
  {
    name: 'caspio_create_record',
    description: 'Create a new record in a table',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table',
        },
        record: {
          type: 'object',
          description: 'Record data as key-value pairs',
          additionalProperties: true,
        },
      },
      required: ['tableName', 'record'],
    },
  },
  {
    name: 'caspio_create_records',
    description: 'Create multiple records in a table at once',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table',
        },
        records: {
          type: 'array',
          description: 'Array of records to create',
          items: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
      required: ['tableName', 'records'],
    },
  },
  {
    name: 'caspio_update_records',
    description: 'Update records matching a WHERE clause',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table',
        },
        updates: {
          type: 'object',
          description: 'Fields to update as key-value pairs',
          additionalProperties: true,
        },
        where: {
          type: 'string',
          description: 'WHERE clause to identify records to update (REQUIRED for safety)',
        },
      },
      required: ['tableName', 'updates', 'where'],
    },
  },
  {
    name: 'caspio_delete_records',
    description: 'Delete records matching a WHERE clause (USE WITH CAUTION)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table',
        },
        where: {
          type: 'string',
          description: 'WHERE clause to identify records to delete (REQUIRED for safety)',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm deletion',
        },
      },
      required: ['tableName', 'where', 'confirm'],
    },
  },

  // Views Tools
  {
    name: 'caspio_list_views',
    description: 'List all views in the Caspio account',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'caspio_get_view_schema',
    description: 'Get the schema/definition of a specific view',
    inputSchema: {
      type: 'object' as const,
      properties: {
        viewName: {
          type: 'string',
          description: 'Name of the view',
        },
      },
      required: ['viewName'],
    },
  },
  {
    name: 'caspio_get_view_records',
    description: 'Get records from a view with optional filtering and sorting',
    inputSchema: {
      type: 'object' as const,
      properties: {
        viewName: {
          type: 'string',
          description: 'Name of the view',
        },
        select: {
          type: 'string',
          description: 'Comma-separated list of fields to select',
        },
        where: {
          type: 'string',
          description: 'WHERE clause for filtering',
        },
        orderBy: {
          type: 'string',
          description: 'ORDER BY clause',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of records to return (max 1000)',
        },
        pageNumber: {
          type: 'number',
          description: 'Page number for pagination',
        },
        pageSize: {
          type: 'number',
          description: 'Page size for pagination (max 1000)',
        },
      },
      required: ['viewName'],
    },
  },

  // Applications Tools
  {
    name: 'caspio_list_applications',
    description: 'List all applications in the Caspio account',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'caspio_get_application',
    description: 'Get details of a specific application',
    inputSchema: {
      type: 'object' as const,
      properties: {
        appName: {
          type: 'string',
          description: 'Name of the application',
        },
      },
      required: ['appName'],
    },
  },

  // Files Tools
  {
    name: 'caspio_list_files',
    description: 'List files in a folder',
    inputSchema: {
      type: 'object' as const,
      properties: {
        folderPath: {
          type: 'string',
          description: 'Path to the folder (default: root "/")',
        },
      },
      required: [],
    },
  },
  {
    name: 'caspio_get_file_metadata',
    description: 'Get metadata for a specific file',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'caspio_delete_file',
    description: 'Delete a file (USE WITH CAUTION)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm deletion',
        },
      },
      required: ['filePath', 'confirm'],
    },
  },

  // Tasks Tools
  {
    name: 'caspio_list_tasks',
    description: 'List all scheduled tasks',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'caspio_get_task',
    description: 'Get details of a specific scheduled task',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskName: {
          type: 'string',
          description: 'Name of the task',
        },
      },
      required: ['taskName'],
    },
  },
  {
    name: 'caspio_run_task',
    description: 'Manually run a scheduled task',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskName: {
          type: 'string',
          description: 'Name of the task to run',
        },
      },
      required: ['taskName'],
    },
  },

  // Directories Tools (v3 API)
  {
    name: 'caspio_list_directories',
    description: 'List all directories in the Caspio account',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'caspio_get_directory',
    description: 'Get details of a specific directory',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directoryName: {
          type: 'string',
          description: 'Name of the directory',
        },
      },
      required: ['directoryName'],
    },
  },
  {
    name: 'caspio_list_directory_users',
    description: 'List users in a directory with optional filtering',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directoryName: {
          type: 'string',
          description: 'Name of the directory',
        },
        select: {
          type: 'string',
          description: 'Comma-separated list of fields to select',
        },
        where: {
          type: 'string',
          description: 'WHERE clause for filtering',
        },
        orderBy: {
          type: 'string',
          description: 'ORDER BY clause',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of users to return',
        },
        pageNumber: {
          type: 'number',
          description: 'Page number for pagination',
        },
        pageSize: {
          type: 'number',
          description: 'Page size for pagination',
        },
      },
      required: ['directoryName'],
    },
  },
  {
    name: 'caspio_get_directory_user',
    description: 'Get a specific user from a directory by their external key',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directoryName: {
          type: 'string',
          description: 'Name of the directory',
        },
        externalKey: {
          type: 'string',
          description: 'External key (unique identifier) of the user',
        },
      },
      required: ['directoryName', 'externalKey'],
    },
  },
  {
    name: 'caspio_create_directory_user',
    description: 'Create a new user in a directory',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directoryName: {
          type: 'string',
          description: 'Name of the directory',
        },
        user: {
          type: 'object',
          description: 'User data including username, password, email, etc.',
          additionalProperties: true,
        },
      },
      required: ['directoryName', 'user'],
    },
  },
  {
    name: 'caspio_update_directory_user',
    description: 'Update a user in a directory',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directoryName: {
          type: 'string',
          description: 'Name of the directory',
        },
        externalKey: {
          type: 'string',
          description: 'External key (unique identifier) of the user',
        },
        updates: {
          type: 'object',
          description: 'Fields to update',
          additionalProperties: true,
        },
      },
      required: ['directoryName', 'externalKey', 'updates'],
    },
  },
  {
    name: 'caspio_delete_directory_user',
    description: 'Delete a user from a directory (USE WITH CAUTION)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directoryName: {
          type: 'string',
          description: 'Name of the directory',
        },
        externalKey: {
          type: 'string',
          description: 'External key (unique identifier) of the user',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm deletion',
        },
      },
      required: ['directoryName', 'externalKey', 'confirm'],
    },
  },
  {
    name: 'caspio_activate_directory_user',
    description: 'Activate a user in a directory',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directoryName: {
          type: 'string',
          description: 'Name of the directory',
        },
        externalKey: {
          type: 'string',
          description: 'External key (unique identifier) of the user',
        },
      },
      required: ['directoryName', 'externalKey'],
    },
  },
  {
    name: 'caspio_deactivate_directory_user',
    description: 'Deactivate a user in a directory',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directoryName: {
          type: 'string',
          description: 'Name of the directory',
        },
        externalKey: {
          type: 'string',
          description: 'External key (unique identifier) of the user',
        },
      },
      required: ['directoryName', 'externalKey'],
    },
  },
  {
    name: 'caspio_authenticate_directory_user',
    description: 'Authenticate a user against a directory. Returns user data if successful.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        directoryName: {
          type: 'string',
          description: 'Name of the directory',
        },
        username: {
          type: 'string',
          description: 'Username to authenticate',
        },
        password: {
          type: 'string',
          description: 'Password to verify',
        },
      },
      required: ['directoryName', 'username', 'password'],
    },
  },

  // Utility Tools
  {
    name: 'caspio_test_connection',
    description: 'Test the connection to Caspio API',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'caspio_get_account_summary',
    description: 'Get a summary of the Caspio account including tables, views, and applications',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// ==================== Server Implementation ====================

class CaspioMcpServer {
  private server: Server;
  private client: CaspioClient;

  constructor() {
    const config = getConfig();
    this.client = new CaspioClient(config);

    this.server = new Server(
      {
        name: 'caspio-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        const tables = await this.client.listTables();
        const views = await this.client.listViews();

        const resources = [
          // Table schemas as resources
          ...tables.map((table) => ({
            uri: `caspio://tables/${table}/schema`,
            name: `Table: ${table}`,
            description: `Schema for table ${table}`,
            mimeType: 'application/json',
          })),
          // View schemas as resources
          ...views.map((view) => ({
            uri: `caspio://views/${view}/schema`,
            name: `View: ${view}`,
            description: `Schema for view ${view}`,
            mimeType: 'application/json',
          })),
        ];

        return { resources };
      } catch (error) {
        return { resources: [] };
      }
    });

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      // Parse the URI
      const tableMatch = uri.match(/^caspio:\/\/tables\/([^/]+)\/schema$/);
      const viewMatch = uri.match(/^caspio:\/\/views\/([^/]+)\/schema$/);

      if (tableMatch) {
        const tableName = decodeURIComponent(tableMatch[1]);
        const schema = await this.client.getTableDefinition(tableName);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(schema, null, 2),
            },
          ],
        };
      }

      if (viewMatch) {
        const viewName = decodeURIComponent(viewMatch[1]);
        const schema = await this.client.getViewDefinition(viewName);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(schema, null, 2),
            },
          ],
        };
      }

      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.executeTool(name, args || {});
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: errorMessage }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async executeTool(name: string, args: Record<string, any>): Promise<any> {
    switch (name) {
      // Tables
      case 'caspio_list_tables':
        return { tables: await this.client.listTables() };

      case 'caspio_get_table_schema':
        const tableDef = await this.client.getTableDefinition(args.tableName);
        const tableFields = await this.client.getTableFields(args.tableName);
        return { ...tableDef, Fields: tableFields };

      case 'caspio_create_table':
        await this.client.createTable({
          Name: args.name,
          Note: args.note,
          Columns: args.columns,
        });
        return { success: true, message: `Table '${args.name}' created successfully` };

      case 'caspio_delete_table':
        if (!args.confirm) {
          throw new Error('Deletion not confirmed. Set confirm=true to proceed.');
        }
        await this.client.deleteTable(args.tableName);
        return { success: true, message: `Table '${args.tableName}' deleted successfully` };

      case 'caspio_add_field':
        await this.client.addField(args.tableName, args.field);
        return { success: true, message: `Field '${args.field.Name}' added to table '${args.tableName}'` };

      case 'caspio_delete_field':
        if (!args.confirm) {
          throw new Error('Deletion not confirmed. Set confirm=true to proceed.');
        }
        await this.client.deleteField(args.tableName, args.fieldName);
        return { success: true, message: `Field '${args.fieldName}' deleted from table '${args.tableName}'` };

      // Records
      case 'caspio_get_records': {
        const options: QueryOptions = {
          select: args.select,
          where: args.where,
          orderBy: args.orderBy,
          groupBy: args.groupBy,
          limit: args.limit,
          pageNumber: args.pageNumber,
          pageSize: args.pageSize,
        };
        const records = await this.client.getRecords(args.tableName, options);
        return { records, count: records.length };
      }

      case 'caspio_create_record': {
        const created = await this.client.createRecord(args.tableName, args.record);
        return { success: true, record: created };
      }

      case 'caspio_create_records': {
        const created = await this.client.createRecords(args.tableName, args.records);
        return { success: true, records: created, count: created.length };
      }

      case 'caspio_update_records': {
        const affected = await this.client.updateRecords(args.tableName, args.updates, args.where);
        return { success: true, recordsAffected: affected };
      }

      case 'caspio_delete_records':
        if (!args.confirm) {
          throw new Error('Deletion not confirmed. Set confirm=true to proceed.');
        }
        const deleted = await this.client.deleteRecords(args.tableName, args.where);
        return { success: true, recordsDeleted: deleted };

      // Views
      case 'caspio_list_views':
        return { views: await this.client.listViews() };

      case 'caspio_get_view_schema':
        return await this.client.getViewDefinition(args.viewName);

      case 'caspio_get_view_records': {
        const options: QueryOptions = {
          select: args.select,
          where: args.where,
          orderBy: args.orderBy,
          limit: args.limit,
          pageNumber: args.pageNumber,
          pageSize: args.pageSize,
        };
        const records = await this.client.getViewRecords(args.viewName, options);
        return { records, count: records.length };
      }

      // Applications
      case 'caspio_list_applications':
        return { applications: await this.client.listApplications() };

      case 'caspio_get_application':
        return await this.client.getApplication(args.appName);

      // Files
      case 'caspio_list_files':
        return { files: await this.client.listFiles(args.folderPath || '/') };

      case 'caspio_get_file_metadata':
        return await this.client.getFileMetadata(args.filePath);

      case 'caspio_delete_file':
        if (!args.confirm) {
          throw new Error('Deletion not confirmed. Set confirm=true to proceed.');
        }
        await this.client.deleteFile(args.filePath);
        return { success: true, message: `File '${args.filePath}' deleted successfully` };

      // Tasks
      case 'caspio_list_tasks':
        return { tasks: await this.client.listTasks() };

      case 'caspio_get_task':
        return await this.client.getTask(args.taskName);

      case 'caspio_run_task':
        await this.client.runTask(args.taskName);
        return { success: true, message: `Task '${args.taskName}' started successfully` };

      // Directories (v3 API)
      case 'caspio_list_directories':
        return { directories: await this.client.listDirectories() };

      case 'caspio_get_directory':
        return await this.client.getDirectory(args.directoryName);

      case 'caspio_list_directory_users': {
        const options: QueryOptions = {
          select: args.select,
          where: args.where,
          orderBy: args.orderBy,
          limit: args.limit,
          pageNumber: args.pageNumber,
          pageSize: args.pageSize,
        };
        const users = await this.client.listDirectoryUsers(args.directoryName, options);
        return { users, count: users.length };
      }

      case 'caspio_get_directory_user':
        return await this.client.getDirectoryUser(args.directoryName, args.externalKey);

      case 'caspio_create_directory_user': {
        const created = await this.client.createDirectoryUser(args.directoryName, args.user);
        return { success: true, user: created };
      }

      case 'caspio_update_directory_user': {
        const updated = await this.client.updateDirectoryUser(
          args.directoryName,
          args.externalKey,
          args.updates
        );
        return { success: true, user: updated };
      }

      case 'caspio_delete_directory_user':
        if (!args.confirm) {
          throw new Error('Deletion not confirmed. Set confirm=true to proceed.');
        }
        await this.client.deleteDirectoryUser(args.directoryName, args.externalKey);
        return { success: true, message: `User deleted from directory '${args.directoryName}'` };

      case 'caspio_activate_directory_user':
        await this.client.activateDirectoryUser(args.directoryName, args.externalKey);
        return { success: true, message: `User activated in directory '${args.directoryName}'` };

      case 'caspio_deactivate_directory_user':
        await this.client.deactivateDirectoryUser(args.directoryName, args.externalKey);
        return { success: true, message: `User deactivated in directory '${args.directoryName}'` };

      case 'caspio_authenticate_directory_user': {
        const authResult = await this.client.authenticateDirectoryUser(
          args.directoryName,
          args.username,
          args.password
        );
        return { success: true, authenticated: true, user: authResult };
      }

      // Utility
      case 'caspio_test_connection': {
        const connected = await this.client.testConnection();
        return { connected, message: connected ? 'Connection successful' : 'Connection failed' };
      }

      case 'caspio_get_account_summary':
        return await this.client.getAccountSummary();

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Caspio MCP Server running on stdio');
  }
}

// ==================== Main Entry Point ====================

const server = new CaspioMcpServer();
server.run().catch(console.error);
