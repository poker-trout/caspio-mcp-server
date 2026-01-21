# Caspio MCP Server - API Reference

Complete reference for all tools, resources, and capabilities provided by the Caspio MCP Server.

---

## Tools

### Tables

#### caspio_list_tables

Lists all tables in the Caspio account.

**Parameters:** None

**Returns:**
```json
{
  "tables": ["Table1", "Table2", "Table3"]
}
```

---

#### caspio_get_table_schema

Gets the complete schema/definition of a table.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tableName` | string | Yes | Name of the table |

**Returns:**
```json
{
  "Name": "Customers",
  "Note": "Customer information",
  "Columns": [
    {
      "Name": "PK_ID",
      "Type": "AUTONUMBER",
      "Unique": true,
      "UniqueAllowNulls": false,
      "Label": "",
      "Description": "",
      "DisplayOrder": 1,
      "OnInsert": false,
      "OnUpdate": false
    },
    {
      "Name": "Email",
      "Type": "STRING",
      "Unique": true,
      "Length": 255
    }
  ]
}
```

---

#### caspio_create_table

Creates a new table in Caspio.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Name for the new table |
| `note` | string | No | Description/note for the table |
| `columns` | array | Yes | Array of column definitions |

**Column Definition:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `Name` | string | Yes | Field name |
| `Type` | string | Yes | Field type (see Field Types) |
| `Unique` | boolean | No | Enforce uniqueness |
| `Description` | string | No | Field description |
| `Length` | number | No | Max length (for STRING) |

**Example:**
```json
{
  "name": "Products",
  "note": "Product catalog",
  "columns": [
    { "Name": "ProductName", "Type": "STRING", "Length": 255 },
    { "Name": "Price", "Type": "CURRENCY" },
    { "Name": "Description", "Type": "TEXT" },
    { "Name": "InStock", "Type": "YES/NO" }
  ]
}
```

**Returns:**
```json
{
  "success": true,
  "message": "Table 'Products' created successfully"
}
```

---

#### caspio_delete_table

Deletes a table from Caspio.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tableName` | string | Yes | Name of the table to delete |
| `confirm` | boolean | Yes | Must be `true` to confirm |

**Returns:**
```json
{
  "success": true,
  "message": "Table 'Products' deleted successfully"
}
```

---

#### caspio_add_field

Adds a new field to an existing table.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tableName` | string | Yes | Name of the table |
| `field` | object | Yes | Field definition |

**Field Definition:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `Name` | string | Yes | Field name |
| `Type` | string | Yes | Field type |
| `Unique` | boolean | No | Enforce uniqueness |
| `Description` | string | No | Field description |
| `Length` | number | No | Max length (for STRING) |

**Returns:**
```json
{
  "success": true,
  "message": "Field 'PhoneNumber' added to table 'Customers'"
}
```

---

#### caspio_delete_field

Deletes a field from a table.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tableName` | string | Yes | Name of the table |
| `fieldName` | string | Yes | Name of the field to delete |
| `confirm` | boolean | Yes | Must be `true` to confirm |

**Returns:**
```json
{
  "success": true,
  "message": "Field 'OldField' deleted from table 'Customers'"
}
```

---

### Records

#### caspio_get_records

Retrieves records from a table with optional filtering, sorting, and pagination.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tableName` | string | Yes | Name of the table |
| `select` | string | No | Comma-separated list of fields |
| `where` | string | No | WHERE clause for filtering |
| `orderBy` | string | No | ORDER BY clause |
| `groupBy` | string | No | GROUP BY clause |
| `limit` | number | No | Maximum records (max 1000) |
| `pageNumber` | number | No | Page number for pagination |
| `pageSize` | number | No | Page size (max 1000) |

**Example:**
```json
{
  "tableName": "Customers",
  "select": "FirstName,LastName,Email",
  "where": "State='CA' AND Active=true",
  "orderBy": "LastName ASC",
  "limit": 50
}
```

**Returns:**
```json
{
  "records": [
    { "FirstName": "John", "LastName": "Doe", "Email": "john@email.com" },
    { "FirstName": "Jane", "LastName": "Smith", "Email": "jane@email.com" }
  ],
  "count": 2
}
```

---

#### caspio_create_record

Creates a single record in a table.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tableName` | string | Yes | Name of the table |
| `record` | object | Yes | Key-value pairs for the record |

**Example:**
```json
{
  "tableName": "Customers",
  "record": {
    "FirstName": "John",
    "LastName": "Doe",
    "Email": "john.doe@email.com",
    "State": "CA"
  }
}
```

**Returns:**
```json
{
  "success": true,
  "record": {
    "PK_ID": 123,
    "FirstName": "John",
    "LastName": "Doe",
    "Email": "john.doe@email.com",
    "State": "CA"
  }
}
```

---

#### caspio_create_records

Creates multiple records in a table at once.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tableName` | string | Yes | Name of the table |
| `records` | array | Yes | Array of record objects |

**Example:**
```json
{
  "tableName": "Products",
  "records": [
    { "Name": "Widget A", "Price": 10.00 },
    { "Name": "Widget B", "Price": 15.00 },
    { "Name": "Widget C", "Price": 20.00 }
  ]
}
```

**Returns:**
```json
{
  "success": true,
  "records": [...],
  "count": 3
}
```

---

#### caspio_update_records

Updates records matching a WHERE clause.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tableName` | string | Yes | Name of the table |
| `updates` | object | Yes | Fields to update |
| `where` | string | Yes | WHERE clause (required) |

**Example:**
```json
{
  "tableName": "Orders",
  "updates": {
    "Status": "Shipped",
    "ShippedDate": "2024-01-15"
  },
  "where": "Status='Pending' AND OrderDate<'2024-01-10'"
}
```

**Returns:**
```json
{
  "success": true,
  "recordsAffected": 15
}
```

---

#### caspio_delete_records

Deletes records matching a WHERE clause.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tableName` | string | Yes | Name of the table |
| `where` | string | Yes | WHERE clause (required) |
| `confirm` | boolean | Yes | Must be `true` to confirm |

**Example:**
```json
{
  "tableName": "Logs",
  "where": "CreatedDate<'2023-01-01'",
  "confirm": true
}
```

**Returns:**
```json
{
  "success": true,
  "recordsDeleted": 1250
}
```

---

### Views

#### caspio_list_views

Lists all views in the Caspio account.

**Parameters:** None

**Returns:**
```json
{
  "views": ["CustomerOrders", "SalesReport", "InventoryStatus"]
}
```

---

#### caspio_get_view_schema

Gets the schema of a view.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `viewName` | string | Yes | Name of the view |

**Returns:** Same structure as `caspio_get_table_schema`

---

#### caspio_get_view_records

Retrieves records from a view.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `viewName` | string | Yes | Name of the view |
| `select` | string | No | Comma-separated list of fields |
| `where` | string | No | WHERE clause for filtering |
| `orderBy` | string | No | ORDER BY clause |
| `limit` | number | No | Maximum records (max 1000) |
| `pageNumber` | number | No | Page number |
| `pageSize` | number | No | Page size (max 1000) |

**Returns:** Same structure as `caspio_get_records`

---

### Applications

#### caspio_list_applications

Lists all applications in the account.

**Parameters:** None

**Returns:**
```json
{
  "applications": [
    {
      "Name": "CustomerPortal",
      "ExternalKey": "abc123",
      "DateCreated": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

#### caspio_get_application

Gets details of a specific application.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `appName` | string | Yes | Name of the application |

**Returns:** Application details including DataPages

---

### Files

#### caspio_list_files

Lists files in a folder.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `folderPath` | string | No | Path to folder (default: "/") |

**Returns:**
```json
{
  "files": [
    {
      "Name": "document.pdf",
      "Size": 102400,
      "DateCreated": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

#### caspio_get_file_metadata

Gets metadata for a file.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filePath` | string | Yes | Path to the file |

**Returns:** File metadata including name, size, dates

---

#### caspio_delete_file

Deletes a file.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filePath` | string | Yes | Path to the file |
| `confirm` | boolean | Yes | Must be `true` to confirm |

**Returns:**
```json
{
  "success": true,
  "message": "File '/folder/file.pdf' deleted successfully"
}
```

---

### Tasks

#### caspio_list_tasks

Lists all scheduled tasks.

**Parameters:** None

**Returns:**
```json
{
  "tasks": [
    {
      "Name": "DailyBackup",
      "Status": "Active",
      "LastRun": "2024-01-15T00:00:00Z"
    }
  ]
}
```

---

#### caspio_get_task

Gets task details.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskName` | string | Yes | Name of the task |

**Returns:** Task configuration and execution history

---

#### caspio_run_task

Manually runs a scheduled task.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskName` | string | Yes | Name of the task to run |

**Returns:**
```json
{
  "success": true,
  "message": "Task 'DailyBackup' started successfully"
}
```

---

### Utility

#### caspio_test_connection

Tests the API connection.

**Parameters:** None

**Returns:**
```json
{
  "connected": true,
  "message": "Connection successful"
}
```

---

#### caspio_get_account_summary

Gets an overview of the account.

**Parameters:** None

**Returns:**
```json
{
  "tables": ["Customers", "Orders", "Products"],
  "views": ["SalesReport", "Inventory"],
  "applications": [...]
}
```

---

## Resources

The server exposes table and view schemas as MCP resources.

### Table Schema Resource

**URI Pattern:** `caspio://tables/{tableName}/schema`

**Example:** `caspio://tables/Customers/schema`

**MIME Type:** `application/json`

### View Schema Resource

**URI Pattern:** `caspio://views/{viewName}/schema`

**Example:** `caspio://views/SalesReport/schema`

**MIME Type:** `application/json`

---

## Field Types

| Type | Description |
|------|-------------|
| `STRING` | Variable-length text (specify Length) |
| `TEXT` | Long text/memo field |
| `NUMBER` | Decimal numbers |
| `INTEGER` | Whole numbers |
| `CURRENCY` | Money values |
| `DATE/TIME` | Date and time |
| `YES/NO` | Boolean (true/false) |
| `FILE` | File attachment |
| `TIMESTAMP` | Auto-updated timestamp |
| `RANDOM ID` | Random identifier |
| `AUTONUMBER` | Auto-incrementing integer |
| `PREFIXED AUTONUMBER` | Auto-increment with prefix |
| `GUID` | Globally unique identifier |
| `PASSWORD` | Encrypted password field |
| `LIST-STRING` | Multi-select string list |
| `LIST-NUMBER` | Multi-select number list |
| `LIST-DATE/TIME` | Multi-select date list |

---

## Query Syntax Reference

### WHERE Clause Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Equals | `Status='Active'` |
| `<>` | Not equals | `Status<>'Deleted'` |
| `>` | Greater than | `Amount>100` |
| `>=` | Greater or equal | `Date>='2024-01-01'` |
| `<` | Less than | `Quantity<10` |
| `<=` | Less or equal | `Date<='2024-12-31'` |
| `LIKE` | Pattern match | `Email LIKE '%@gmail.com'` |
| `IS NULL` | Null check | `ShippedDate IS NULL` |
| `IS NOT NULL` | Not null check | `Email IS NOT NULL` |
| `IN` | In list | `State IN ('CA','NY','TX')` |
| `BETWEEN` | Range | `Amount BETWEEN 10 AND 100` |

### Logical Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `AND` | Both conditions | `State='CA' AND Active=true` |
| `OR` | Either condition | `Status='New' OR Status='Pending'` |
| `NOT` | Negation | `NOT Status='Deleted'` |

### ORDER BY Syntax

```
FieldName ASC                    -- Ascending (A-Z, 0-9)
FieldName DESC                   -- Descending (Z-A, 9-0)
Field1 ASC, Field2 DESC          -- Multiple fields
```

### Wildcards (for LIKE)

| Wildcard | Description | Example |
|----------|-------------|---------|
| `%` | Any characters | `'%smith%'` matches "John Smith" |
| `_` | Single character | `'_ohn'` matches "John" |

---

## API Limits

| Limit | Value |
|-------|-------|
| Max records per request | 1,000 |
| Max URI length | 2,047 characters |
| Token expiration | 24 hours (auto-refreshed) |
| Max refresh tokens | 1,000 per account |

---

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Authentication failed |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |
