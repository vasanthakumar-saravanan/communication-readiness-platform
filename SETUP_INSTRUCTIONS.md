# Setup Instructions for Testing

## Step 1: Configure Supabase Connection

1. Open `backend/.env`
2. Replace the DATABASE_URL with your actual Supabase connection string:

```bash
# Find your connection string at: Supabase Project → Settings → Database → Connection String
DATABASE_URL=postgresql://postgres.[PROJECT_ID]:[YOUR_PASSWORD]@[HOST].supabase.co:5432/postgres
```

**IMPORTANT:** 
- Do NOT commit this file
- Do NOT share this connection string
- The password is your Supabase database password

## Step 2: Configure Groq (Optional - for real AI)

The system works with MockProvider (simulated AI) by default.

To enable real Groq AI:

1. Get API key from: https://console.groq.com/keys
2. Open `ai-service/.env`
3. Set:

```bash
LLM_API_KEY=gsk_your_actual_groq_key_here
```

**Current Status:** MockProvider active (works for testing without API key)

## Step 3: Create Test Student Accounts

Once DATABASE_URL is configured:

```bash
cd backend
node scripts/create-test-students.js
```

This creates 3 test students:
- student.test01@example.com (Password: Test@123456)
- student.test02@example.com (Password: Test@123456)
- student.test03@example.com (Password: Test@123456)

## Step 4: Start Services

**Terminal 1 - AI Service:**
```bash
cd ai-service
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

**Terminal 2 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm run dev
```

## Step 5: Test Login

1. Open http://localhost:5173
2. Click "Sign In"
3. Use test credentials:
   - Email: student.test01@example.com
   - Password: Test@123456

## Step 6: Test Interview Flow

Once logged in:
1. Navigate to student dashboard
2. Click "Start Mock Interview"
3. Answer questions (use voice or type)
4. Complete 3 turns
5. View final report

## Environment Files Summary

### backend/.env (Node.js Backend)
- `DATABASE_URL` - Supabase connection string (REQUIRED)
- `AI_SERVICE_URL` - Points to AI service (default: http://127.0.0.1:8001)
- `JWT_SECRET` - For auth tokens
- Other config vars

### ai-service/.env (Python AI Service)
- `LLM_PROVIDER` - Set to "groq" (already configured)
- `LLM_API_KEY` - Groq API key (optional, uses MockProvider if empty)
- `LLM_MODEL` - llama-3.3-70b-versatile (already configured)
- `DATABASE_URL` - Same Supabase connection (REQUIRED for Module 3)

## Health Check Endpoints

- AI Service: http://localhost:8001/health
- Backend: http://localhost:5000/api/health
- Frontend: http://localhost:5173

## Troubleshooting

### Database Connection Failed
- Verify DATABASE_URL in backend/.env
- Check Supabase project is active
- Verify network connectivity
- Test connection with the create-test-students script

### AI Service Not Responding
- Check port 8001 is not in use
- Verify python dependencies installed: `pip install -r requirements.txt`
- Check ai-service/.env exists

### Backend Not Starting
- Check port 5000 is not in use
- Verify node_modules installed: `npm install`
- Check backend/.env exists

### Frontend Login Fails
- Verify backend is running on port 5000
- Check test students were created successfully
- Verify credentials are correct

## Security Notes

**DO NOT:**
- ❌ Commit .env files
- ❌ Share database connection strings
- ❌ Share Groq API keys
- ❌ Expose credentials in logs

**SAFE TO SHARE:**
- ✅ Test student emails (student.test01@example.com, etc.)
- ✅ Test passwords (Test@123456)
- ✅ Port numbers and localhost URLs
- ✅ Service health status
