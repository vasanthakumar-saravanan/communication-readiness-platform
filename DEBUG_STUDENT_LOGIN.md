# Student Login Debug Report

## Backend Verification ✅

All backend endpoints are working correctly:

```bash
# Test 1: Student Login API
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student.real01@example.com","password":"student123"}'

Result: ✅ HTTP 200
Response: { token, user: {id, name, email, role: "STUDENT"}, studentId }
```

```bash
# Test 2: Token Validation
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <token>"

Result: ✅ HTTP 200
Response: { user: {id, name, email, role: "STUDENT"}, studentId }
```

```bash
# Test 3: Student Profile
curl -X GET http://localhost:5000/api/students/:studentId \
  -H "Authorization: Bearer <token>"

Result: ✅ HTTP 200
Response: { student: {...} }
```

**Conclusion**: Backend authentication is fully functional.

---

## Frontend Analysis

### Issue Hypothesis

The login modal shows "Authentication required" despite successful backend API calls. Possible causes:

### 1. ❓ Frontend State Not Updating

**File**: `frontend/src/context/AppContext.tsx`

**loginUser function** (lines 1772-1823):
1. Calls `api.auth.login(email, password)` ✓
2. Stores token via `api.setToken()` - but this is called INSIDE api.auth.login
3. Sets `setIsAuthenticated(true)` at line 1800 ✓
4. Sets `setAuthModalOpen(false)` at line 1802 ✓
5. Calls `api.student.getProfile()` at line 1808 - **MIGHT THROW ERROR**

**Potential Issue**: If `api.student.getProfile()` throws an error (line 1817), it's caught but not reported to the user. This might cause issues.

### 2. ❓ Token Not Stored Correctly

**File**: `frontend/src/services/api.ts`

**api.auth.login** (lines 1680-1703):
- Line 1693: `this.setToken(response.token)` ✓
- Line 1694: `localStorage.setItem('auth_user', ...)` ✓

**setToken method** (lines 317-324):
- Updates `this.token` instance variable ✓
- Updates localStorage ✓

**BUT**: The API client is instantiated ONCE. On mount, the constructor (line 314) reads token from localStorage. After login, setToken updates both instance and storage.

### 3. ❓ Mount useEffect Interfering

**File**: `frontend/src/context/AppContext.tsx` (lines 348-377)

This useEffect runs ONCE on mount:
1. Reads `auth_token` from localStorage
2. If exists: calls `api.auth.getMe()`
3. If getMe() succeeds: sets `isAuthenticated = true`
4. If getMe() fails: **CLEARS ALL AUTH STATE** (line 372)

**Dependency array**: `[]` (empty - runs only once on mount)

**Issue**: This won't interfere with login because it only runs on mount, not after login.

### 4. ❓ App.tsx Route Guard

**File**: `frontend/src/App.tsx` (line 34)

```tsx
if (!isAuthenticated) {
  return <LandingPage />;
}
```

The LandingPage contains the AuthModal. If `isAuthenticated` is false, the modal shows.

**Issue**: If `isAuthenticated` is not being set to true, this will keep showing the modal.

---

## Critical Debug Steps

### Test 1: Check Browser Console

Open browser console and attempt student login. Look for:
- Network requests to `/api/auth/login`
- HTTP status codes
- Response data
- JavaScript errors
- Console.log from loginUser

### Test 2: Check localStorage After Login

After attempting login, check browser DevTools → Application → Local Storage:
- Is `auth_token` stored?
- Is `auth_user` stored?
- What is the value?

### Test 3: Check React State

If React DevTools is available:
- Check AppContext state
- Is `isAuthenticated` true or false?
- Is `authModalOpen` true or false?
- What is `currentUser`?

---

## Most Likely Root Cause

Based on code analysis, the most likely issue is:

### **The frontend API baseURL is `/api` which relies on Vite proxy**

**File**: `frontend/src/services/api.ts` (line 311)
```typescript
private readonly baseURL = '/api'; // Proxied by nginx in production
```

**File**: `frontend/vite.config.ts` (lines 56-61)
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:5000',  // ← Backend port
    changeOrigin: true,
    secure: false,
  }
}
```

**Issue**: If the Vite dev server proxy is not forwarding correctly, the frontend API calls might be failing.

---

## Recommended Fix

### Option 1: Test Direct API Call (Bypass Proxy)

Temporarily change `api.ts` baseURL:

```typescript
// frontend/src/services/api.ts line 311
private readonly baseURL = 'http://localhost:5000/api';
```

This bypasses the Vite proxy and calls backend directly.

**Test**: Try student login again.

### Option 2: Verify Vite Proxy

Check if Vite proxy is working:

```bash
# Open browser, go to http://localhost:5173
# Open DevTools Network tab
# Try login
# Check if /api/auth/login request goes to:
#   - localhost:5173/api/auth/login (proxied) ✓
#   - OR localhost:5000/api/auth/login (direct) ✗
```

If requests are NOT being proxied, restart Vite:

```bash
cd frontend
npm run dev
```

### Option 3: Add Debug Logging

Add temporary console.log in loginUser:

```typescript
// frontend/src/context/AppContext.tsx line 1772
const loginUser = async (email: string, password: string) => {
  console.log('[DEBUG] loginUser called:', email);
  const res = await api.auth.login(email, password);
  console.log('[DEBUG] login response:', res);
  const user = res.user;
  console.log('[DEBUG] Setting isAuthenticated = true');
  // ... rest of code
  setIsAuthenticated(true);
  console.log('[DEBUG] isAuthenticated set to true');
  setAuthModalOpen(false);
  console.log('[DEBUG] authModalOpen set to false');
};
```

**Test**: Check console output during login.

---

## Next Steps

1. **Open browser DevTools**
2. **Go to http://localhost:5173**
3. **Attempt student login**
4. **Check**:
   - Console for errors
   - Network tab for API calls
   - Application → Local Storage for auth_token
5. **Report findings**

---

## Backend Services Confirmation

```bash
# Backend running on port 5000
$ curl http://localhost:5000/api/health
{"status":"ok","service":"backend","env":"development"}

# Frontend running on port 5173
$ curl http://localhost:5173
<!DOCTYPE html>  <!-- Vite dev server -->
```

Both services are running correctly.
