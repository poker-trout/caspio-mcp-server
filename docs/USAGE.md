# Caspio MCP Server - Usage Guide

This guide provides detailed examples of how to use the Caspio MCP Server with AI agents like Claude.

## Table of Contents

1. [Basic Operations](#basic-operations)
2. [Working with Tables](#working-with-tables)
3. [Working with Records](#working-with-records)
4. [Working with Views](#working-with-views)
5. [Advanced Queries](#advanced-queries)
6. [Bulk Operations](#bulk-operations)
7. [Schema Management](#schema-management)
8. [Best Practices](#best-practices)

---

## Basic Operations

### Testing the Connection

**Ask Claude:**
> "Can you test the connection to my Caspio database?"

**What happens:**
Claude uses `caspio_test_connection` to verify API connectivity.

**Example response:**
```json
{
  "connected": true,
  "message": "Connection successful"
}
```

### Getting an Account Overview

**Ask Claude:**
> "Give me an overview of my Caspio account"

**What happens:**
Claude uses `caspio_get_account_summary` to retrieve:
- List of all tables
- List of all views
- List of all applications

---

## Working with Tables

### Listing All Tables

**Ask Claude:**
> "What tables do I have in Caspio?"

**Result:**
```json
{
  "tables": [
    "Customers",
    "Orders",
    "Products",
    "Inventory"
  ]
}
```

### Getting Table Schema

**Ask Claude:**
> "Show me the structure of the Customers table"

**Result:**
```json
{
  "Name": "Customers",
  "Note": "Customer master data",
  "Columns": [
    {
      "Name": "PK_ID",
      "Type": "AUTONUMBER",
      "Unique": true
    },
    {
      "Name": "FirstName",
      "Type": "STRING",
      "Length": 255
    },
    {
      "Name": "LastName",
      "Type": "STRING",
      "Length": 255
    },
    {
      "Name": "Email",
      "Type": "STRING",
      "Unique": true,
      "Length": 255
    },
    {
      "Name": "CreatedDate",
      "Type": "DATE/TIME"
    }
  ]
}
```

### Creating a New Table

**Ask Claude:**
> "Create a new table called 'Feedback' with fields for CustomerID (number), Rating (number), Comment (text), and SubmittedDate (datetime)"

**What Claude does:**
Uses `caspio_create_table` with:
```json
{
  "name": "Feedback",
  "columns": [
    { "Name": "CustomerID", "Type": "NUMBER" },
    { "Name": "Rating", "Type": "NUMBER" },
    { "Name": "Comment", "Type": "TEXT" },
    { "Name": "SubmittedDate", "Type": "DATE/TIME" }
  ]
}
```

---

## Working with Records

### Reading Records

#### Get All Records

**Ask Claude:**
> "Show me all customers"

#### Get Records with Specific Fields

**Ask Claude:**
> "Show me just the names and emails of all customers"

**What Claude uses:**
```json
{
  "tableName": "Customers",
  "select": "FirstName,LastName,Email"
}
```

#### Get Records with Filtering

**Ask Claude:**
> "Show me customers from California"

**What Claude uses:**
```json
{
  "tableName": "Customers",
  "where": "State='CA'"
}
```

#### Get Records with Sorting

**Ask Claude:**
> "Show me the 10 most recent orders"

**What Claude uses:**
```json
{
  "tableName": "Orders",
  "orderBy": "OrderDate DESC",
  "limit": 10
}
```

#### Get Records with Pagination

**Ask Claude:**
> "Show me customers page by page, 20 at a time"

**What Claude uses:**
```json
{
  "tableName": "Customers",
  "pageSize": 20,
  "pageNumber": 1
}
```

### Creating Records

#### Create a Single Record

**Ask Claude:**
> "Add a new customer: John Smith, john.smith@email.com, from New York"

**What Claude uses:**
```json
{
  "tableName": "Customers",
  "record": {
    "FirstName": "John",
    "LastName": "Smith",
    "Email": "john.smith@email.com",
    "State": "NY"
  }
}
```

#### Create Multiple Records

**Ask Claude:**
> "Add these three products: Widget A ($10), Widget B ($15), Widget C ($20)"

**What Claude uses:**
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

### Updating Records

#### Update Matching Records

**Ask Claude:**
> "Mark all orders from January 2024 as 'Shipped'"

**What Claude uses:**
```json
{
  "tableName": "Orders",
  "updates": { "Status": "Shipped" },
  "where": "OrderDate>='2024-01-01' AND OrderDate<'2024-02-01'"
}
```

#### Update a Specific Record

**Ask Claude:**
> "Update customer with ID 123 to have email 'new.email@example.com'"

**What Claude uses:**
```json
{
  "tableName": "Customers",
  "updates": { "Email": "new.email@example.com" },
  "where": "PK_ID=123"
}
```

### Deleting Records

**Ask Claude:**
> "Delete all orders older than 2020"

**What Claude uses:**
```json
{
  "tableName": "Orders",
  "where": "OrderDate<'2020-01-01'",
  "confirm": true
}
```

**Note:** All delete operations require explicit confirmation.

---

## Working with Views

### Listing Views

**Ask Claude:**
> "What views are available?"

### Querying Views

**Ask Claude:**
> "Show me the data from the CustomerOrderSummary view"

**Ask Claude:**
> "From the SalesReport view, show me sales over $1000 from this year"

**What Claude uses:**
```json
{
  "viewName": "SalesReport",
  "where": "TotalSales>1000 AND Year=2024"
}
```

---

## Advanced Queries

### Complex WHERE Clauses

#### Multiple Conditions with AND

**Ask Claude:**
> "Find customers who are from California AND have made a purchase in the last 30 days"

```json
{
  "where": "State='CA' AND LastPurchaseDate>=DATEADD(day,-30,GETDATE())"
}
```

#### Multiple Conditions with OR

**Ask Claude:**
> "Find products that are either out of stock OR discontinued"

```json
{
  "where": "StockLevel=0 OR Status='Discontinued'"
}
```

#### Pattern Matching with LIKE

**Ask Claude:**
> "Find all customers whose email ends with '@gmail.com'"

```json
{
  "where": "Email LIKE '%@gmail.com'"
}
```

#### NULL Checks

**Ask Claude:**
> "Find orders that haven't been shipped yet"

```json
{
  "where": "ShippedDate IS NULL"
}
```

### Sorting

#### Single Field Sort

```json
{
  "orderBy": "CreatedDate DESC"
}
```

#### Multiple Field Sort

```json
{
  "orderBy": "State ASC, LastName ASC, FirstName ASC"
}
```

### Grouping

**Ask Claude:**
> "Show me total sales by product category"

```json
{
  "tableName": "Sales",
  "select": "Category,SUM(Amount) as TotalSales",
  "groupBy": "Category"
}
```

---

## Bulk Operations

### Importing Data

**Ask Claude:**
> "I need to import a list of 50 new products. Here's the data: [...]"

Claude will use `caspio_create_records` to insert all records at once.

### Batch Updates

**Ask Claude:**
> "Update all products in category 'Electronics' to have a 10% price increase"

**What Claude uses:**
```json
{
  "tableName": "Products",
  "updates": { "Price": "Price * 1.1" },
  "where": "Category='Electronics'"
}
```

---

## Schema Management

### Adding a Field

**Ask Claude:**
> "Add a 'PhoneNumber' field to the Customers table"

**What Claude uses:**
```json
{
  "tableName": "Customers",
  "field": {
    "Name": "PhoneNumber",
    "Type": "STRING",
    "Length": 20,
    "Description": "Customer phone number"
  }
}
```

### Field Types

Available field types:
- `STRING` - Text up to specified length
- `TEXT` - Long text/memo
- `NUMBER` - Decimal numbers
- `INTEGER` - Whole numbers
- `CURRENCY` - Money values
- `DATE/TIME` - Date and time
- `YES/NO` - Boolean
- `AUTONUMBER` - Auto-incrementing ID
- `GUID` - Globally unique identifier
- `PASSWORD` - Encrypted password field

---

## Best Practices

### 1. Use Specific Queries

**Instead of:**
> "Show me all data"

**Use:**
> "Show me the name and email of active customers from California"

This reduces data transfer and improves performance.

### 2. Leverage Pagination for Large Tables

**Instead of:**
> "Show me all orders"

**Use:**
> "Show me the first 100 orders, sorted by date"

Caspio limits responses to 1000 records per request.

### 3. Always Use WHERE Clauses for Updates/Deletes

The server requires WHERE clauses for updates and deletes to prevent accidental mass modifications.

### 4. Use Views for Complex Queries

If you frequently run complex queries joining multiple tables, create a View in Caspio and query it through the MCP server.

### 5. Be Descriptive in Your Requests

**Instead of:**
> "Update the customer"

**Use:**
> "Update customer John Smith (ID 123) to change his email to john.new@email.com"

This helps Claude construct the correct API calls.

### 6. Verify Before Deleting

The server requires explicit confirmation for delete operations. This is a safety feature.

---

## Common Use Cases

### Customer Management

```
"Show me all customers who signed up this month"
"Find customers who haven't placed an order in 6 months"
"Update the address for customer ID 456"
"Add a new customer with these details..."
```

### Order Processing

```
"Show me all pending orders"
"Find orders over $500 that need shipping"
"Mark order #789 as shipped"
"Show me today's orders sorted by total amount"
```

### Inventory Management

```
"What products are low in stock?"
"Update stock count for product SKU-123"
"Show me products that need reordering"
"Find discontinued products that still have inventory"
```

### Reporting

```
"Show me sales by month for this year"
"What's the average order value by customer segment?"
"List the top 10 customers by total purchases"
"Show me the product categories with declining sales"
```

---

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Table not found" | Incorrect table name | Use `caspio_list_tables` to verify names |
| "Field not found" | Incorrect field name | Use `caspio_get_table_schema` to check fields |
| "Invalid WHERE clause" | Syntax error in filter | Check quotes and operators |
| "Maximum records exceeded" | Requesting too many records | Add pagination or filters |

### Example Error Recovery

**Ask Claude:**
> "I got an error when trying to update the Customers table"

Claude can diagnose by:
1. Checking table exists with `caspio_list_tables`
2. Verifying schema with `caspio_get_table_schema`
3. Testing the WHERE clause with a SELECT first

---

## Tips for Working with Claude

1. **Be specific about what you want**
   - Include table names, field names, and conditions

2. **Ask for confirmation before destructive operations**
   - "Before deleting, show me what records would be affected"

3. **Request schema information when needed**
   - "What fields are in the Orders table?"

4. **Use natural language for complex queries**
   - Claude can translate business requirements into proper API calls

5. **Request counts before bulk operations**
   - "How many records would be updated if we..."
