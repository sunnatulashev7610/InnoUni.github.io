# Registration Fix Guide

## Issues Found and Fixed

### 1. Database Connection Issue
The registration endpoint was failing because the database connection wasn't properly established.

### 2. Role Validation Issue
The registration endpoint wasn't properly validating the role parameter from the frontend.

### 3. Password Validation Issue
The registration wasn't validating password strength requirements.

## Fixes Applied

### 1. Enhanced Registration Endpoint
- Added proper role validation
- Added password strength validation (minimum 8 characters)
- Added better error messages
- Returns user data after successful registration

### 2. Enhanced Login Endpoint
- Added role matching validation
- Better error messages for role mismatches
- Improved security checks

### 3. Database Connection
- Added proper error handling for database connection
- Added table creation if they don't exist
- Better error logging

## Testing the Fix

To test if registration is working:

1. **Start the server:**
   ```bash
   cd backend
   node server.js
   ```

2. **Test registration:**
   ```bash
   curl -X POST http://localhost:3000/api/auth/register \
        -H "Content-Type: application/json" \
        -d '{"full_name":"Test User","email":"test@example.com","password":"TestPassword123","role":"student"}'
   ```

3. **Test login:**
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
        -H "Content-Type: application/json" \
        -d '{"email":"test@example.com","password":"TestPassword123","role":"student"}'
   ```

## Frontend Integration

The frontend registration page should now work properly with:

1. **Role Selection:** Users can choose between Student and Teacher roles
2. **Validation:** Proper validation for all fields
3. **Auto-Login:** After successful registration, users are automatically logged in
4. **Redirect:** Users are redirected to the appropriate dashboard based on their role

## Database Setup

Make sure MySQL is running and the database exists:

```sql
CREATE DATABASE IF NOT EXISTS oqiv_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE oqiv_platform;

-- Run the init.sql file to create tables
```

## Common Issues and Solutions

### Issue: "Database connection failed"
**Solution:** Make sure MySQL is running and the connection details in server.js are correct.

### Issue: "Invalid role specified"
**Solution:** The frontend must send one of: 'student', 'teacher', 'admin'

### Issue: "Password must be at least 8 characters"
**Solution:** Ensure the frontend validates password requirements before sending to the API.

### Issue: "User with this email already exists"
**Solution:** The user must use a different email address or log in instead.

## Next Steps

1. Start the backend server
2. Test the registration endpoint
3. Test the login endpoint
4. Verify the frontend registration page works
5. Test role-based routing to dashboards
