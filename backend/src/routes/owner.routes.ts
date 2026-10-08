import { Router, Response, NextFunction } from 'express';
import { db } from '../shared/db/pool';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { AuthRequest } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { z } from 'zod';
import { AppError } from '../shared/errors/AppError';
import crypto from 'crypto';
import { env } from '../config/env';
import { sendSuperAdminInvitationEmail } from '../services/emailService';

export const ownerRouter = Router();

// All owner routes require PLATFORM_OWNER role
const requirePlatformOwner = requireRole('PLATFORM_OWNER');

// GET /institutions/:id[/programs|/departments]: the Platform Owner, or a Super
// Admin / College Admin reading their own institution.
const requireOwnerOrOwnInstitution = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user!;
    if (user.role === 'PLATFORM_OWNER') { next(); return; }
    if (user.role === 'SUPER_ADMIN' || user.role === 'COLLEGE_ADMIN') {
      const { rows } = await db.query<{ institution_id: string | null }>(
        'SELECT institution_id FROM identity.users WHERE id = $1',
        [user.id]
      );
      if (rows[0]?.institution_id && rows[0].institution_id === req.params.id) { next(); return; }
    }
    throw new AppError(403, 'Access denied', 'FORBIDDEN');
  } catch (err) {
    sendError(res, err);
  }
};

// ── GET /api/owner/institutions ───────────────────────────────────────────────
// List all institutions
ownerRouter.get(
  '/institutions',
  requirePlatformOwner,
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { rows } = await db.query(
        `SELECT
          id,
          name,
          code,
          campus_city,
          created_at
         FROM org.institutions
         ORDER BY name`
      );
      sendSuccess(res, { institutions: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── POST /api/owner/institutions ──────────────────────────────────────────────
// Create a new institution
const createInstitutionSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  type: z.string().optional(),
  campusCity: z.string().optional()
});

ownerRouter.post(
  '/institutions',
  requirePlatformOwner,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = createInstitutionSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(422).json({
          status: 'error',
          message: 'Invalid institution data',
          errors: parsed.error.errors
        });
        return;
      }

      const { name, code, campusCity } = parsed.data;

      // Check if code already exists
      const existingCheck = await db.query(
        `SELECT id FROM org.institutions WHERE code = $1`,
        [code.toUpperCase()]
      );

      if (existingCheck.rows.length > 0) {
        res.status(409).json({
          status: 'error',
          message: 'Institution code already exists'
        });
        return;
      }

      // Insert institution
      const result = await db.query(
        `INSERT INTO org.institutions (name, code, campus_city)
         VALUES ($1, $2, $3)
         RETURNING id, name, code, campus_city, created_at`,
        [name, code.toUpperCase(), campusCity || null]
      );

      const institution = result.rows[0];

      sendSuccess(res, {
        institution: {
          id: institution.id,
          name: institution.name,
          code: institution.code,
          campusCity: institution.campus_city,
          createdAt: institution.created_at
        }
      }, 201);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── GET /api/owner/institutions/:id ───────────────────────────────────────────
// Get institution details with metrics
ownerRouter.get(
  '/institutions/:id',
  requireOwnerOrOwnInstitution,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Get institution details
      const institutionResult = await db.query(
        `SELECT
          id,
          name,
          code,
          campus_city,
          created_at
         FROM org.institutions
         WHERE id = $1`,
        [id]
      );

      if (institutionResult.rows.length === 0) {
        res.status(404).json({
          status: 'error',
          message: 'Institution not found'
        });
        return;
      }

      const institution = institutionResult.rows[0];

      // Get program count
      const programCountResult = await db.query(
        `SELECT COUNT(*) as count
         FROM org.programs
         WHERE institution_id = $1`,
        [id]
      );
      const programCount = parseInt(programCountResult.rows[0].count);

      // Get student count (via batches)
      const studentCountResult = await db.query(
        `SELECT COUNT(DISTINCT s.id) as count
         FROM org.students s
         JOIN org.batches b ON s.batch_id = b.id
         JOIN org.programs p ON b.program_id = p.id
         WHERE p.institution_id = $1`,
        [id]
      );
      const studentCount = parseInt(studentCountResult.rows[0].count);

      // Get department count
      const deptCountResult = await db.query(
        `SELECT COUNT(*) as count
         FROM org.departments
         WHERE institution_id = $1`,
        [id]
      );
      const departmentCount = parseInt(deptCountResult.rows[0].count);

      // Get Super Admin info (if exists)
      const superAdminResult = await db.query(
        `SELECT u.id, u.name, u.email, u.status, u.created_at
         FROM identity.users u
         WHERE u.role = 'SUPER_ADMIN'
         AND EXISTS (
           SELECT 1 FROM identity.invites i
           WHERE i.institution_id = $1
           AND i.accepted_by_user_id = u.id
           AND i.status = 'ACCEPTED'
         )
         LIMIT 1`,
        [id]
      );

      let superAdmin = null;
      let superAdminStatus = 'NONE';

      if (superAdminResult.rows.length > 0) {
        superAdmin = superAdminResult.rows[0];
        superAdminStatus = 'ACTIVE';
      } else {
        // Check for pending invite
        const pendingInviteResult = await db.query(
          `SELECT id, email, status, expires_at
           FROM identity.invites
           WHERE institution_id = $1
           AND role = 'SUPER_ADMIN'
           AND status = 'PENDING'
           ORDER BY created_at DESC
           LIMIT 1`,
          [id]
        );

        if (pendingInviteResult.rows.length > 0) {
          superAdminStatus = 'PENDING_INVITE';
          superAdmin = {
            email: pendingInviteResult.rows[0].email,
            inviteStatus: pendingInviteResult.rows[0].status,
            expiresAt: pendingInviteResult.rows[0].expires_at
          };
        }
      }

      sendSuccess(res, {
        institution,
        metrics: {
          programCount,
          studentCount,
          departmentCount
        },
        superAdmin,
        superAdminStatus
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── GET /api/owner/stats ──────────────────────────────────────────────────────
// Platform-wide statistics
ownerRouter.get(
  '/stats',
  requirePlatformOwner,
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      // Total institutions
      const institutionsResult = await db.query(
        `SELECT COUNT(*) as count FROM org.institutions`
      );
      const totalInstitutions = parseInt(institutionsResult.rows[0].count);

      // Total Super Admins (accepted invites)
      const superAdminsResult = await db.query(
        `SELECT COUNT(*) as count
         FROM identity.users
         WHERE role = 'SUPER_ADMIN'`
      );
      const totalSuperAdmins = parseInt(superAdminsResult.rows[0].count);

      // Active Super Admins
      const activeSuperAdminsResult = await db.query(
        `SELECT COUNT(*) as count
         FROM identity.users
         WHERE role = 'SUPER_ADMIN'
         AND status = 'ACTIVE'`
      );
      const activeSuperAdmins = parseInt(activeSuperAdminsResult.rows[0].count);

      // Total students
      const studentsResult = await db.query(
        `SELECT COUNT(*) as count FROM org.students`
      );
      const totalStudents = parseInt(studentsResult.rows[0].count);

      // Total programs
      const programsResult = await db.query(
        `SELECT COUNT(*) as count FROM org.programs`
      );
      const totalPrograms = parseInt(programsResult.rows[0].count);

      // Pending invites
      const pendingInvitesResult = await db.query(
        `SELECT COUNT(*) as count
         FROM identity.invites
         WHERE status = 'PENDING'`
      );
      const pendingInvites = parseInt(pendingInvitesResult.rows[0].count);

      sendSuccess(res, {
        totalInstitutions,
        totalSuperAdmins,
        activeSuperAdmins,
        totalStudents,
        totalPrograms,
        pendingInvites
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── GET /api/owner/users ──────────────────────────────────────────────────────
// List users with filters (cross-institution for Platform Owner)
ownerRouter.get(
  '/users',
  requirePlatformOwner,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const roleFilter = (req.query.role as string) ?? null;
      const statusFilter = (req.query.status as string) ?? null;
      const searchFilter = (req.query.search as string) ?? null;
      const institutionIdFilter = (req.query.institution_id as string) ?? null;

      let query = `
        SELECT
          u.id,
          u.name,
          u.email,
          u.role,
          u.status,
          u.created_at
        FROM identity.users u
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (roleFilter) {
        query += ` AND u.role = $${paramIndex}`;
        params.push(roleFilter);
        paramIndex++;
      }

      if (statusFilter) {
        query += ` AND u.status = $${paramIndex}`;
        params.push(statusFilter);
        paramIndex++;
      }

      if (searchFilter) {
        query += ` AND (u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
        params.push(`%${searchFilter}%`);
        paramIndex++;
      }

      // Filter by institution (for Super Admins via invites)
      if (institutionIdFilter) {
        query += ` AND EXISTS (
          SELECT 1 FROM identity.invites i
          WHERE i.accepted_by_user_id = u.id
          AND i.institution_id = $${paramIndex}
          AND i.status = 'ACCEPTED'
        )`;
        params.push(institutionIdFilter);
        paramIndex++;
      }

      query += ` ORDER BY u.created_at DESC LIMIT 100`;

      const { rows } = await db.query(query, params);
      sendSuccess(res, { users: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── GET /api/owner/institutions/:id/programs ──────────────────────────────────
// Get programs for a specific institution
ownerRouter.get(
  '/institutions/:id/programs',
  requireOwnerOrOwnInstitution,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const { rows } = await db.query(
        `SELECT
          id,
          institution_id,
          name,
          code,
          created_at
         FROM org.programs
         WHERE institution_id = $1
         ORDER BY name`,
        [id]
      );

      sendSuccess(res, { programs: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── GET /api/owner/institutions/:id/departments ───────────────────────────────
// Get departments for a specific institution
ownerRouter.get(
  '/institutions/:id/departments',
  requireOwnerOrOwnInstitution,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const { rows } = await db.query(
        `SELECT
          id,
          institution_id,
          name,
          code,
          is_active,
          created_at,
          updated_at
         FROM org.departments
         WHERE institution_id = $1
         ORDER BY name`,
        [id]
      );

      sendSuccess(res, { departments: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── GET /api/owner/students ───────────────────────────────────────────────────
// Get students with detailed information (cross-institution)
ownerRouter.get(
  '/students',
  requirePlatformOwner,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const institutionIdFilter = (req.query.institution_id as string) ?? null;
      const rawLimit = parseInt(req.query.limit as string, 10);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 100;

      let query = `
        SELECT
          s.id,
          u.name,
          u.email,
          s.roll_number,
          b.year as batch_year,
          p.name as program_name,
          p.institution_id,
          inst.name as institution_name,
          dept.name as department_name,
          s.created_at
        FROM org.students s
        JOIN identity.users u ON s.user_id = u.id
        JOIN org.batches b ON s.batch_id = b.id
        JOIN org.programs p ON b.program_id = p.id
        JOIN org.institutions inst ON p.institution_id = inst.id
        LEFT JOIN org.departments dept ON dept.id = u.department_id
        WHERE 1=1
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (institutionIdFilter) {
        query += ` AND p.institution_id = $${paramIndex}`;
        params.push(institutionIdFilter);
        paramIndex++;
      }

      query += ` ORDER BY s.created_at DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const { rows } = await db.query(query, params);
      sendSuccess(res, { students: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// INVITE FLOW ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── POST /api/owner/institutions/:id/invite ───────────────────────────────────
// Invite Super Admin for an institution
const inviteSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email()
});

ownerRouter.post(
  '/institutions/:id/invite',
  requirePlatformOwner,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id: institutionId } = req.params;
      const parsed = inviteSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(422).json({
          status: 'error',
          message: 'Invalid invite data',
          errors: parsed.error.errors
        });
        return;
      }

      const { firstName, lastName, email } = parsed.data;
      const fullName = `${firstName} ${lastName}`.trim();
      const normalizedEmail = email.toLowerCase().trim();

      // Check if institution exists
      const instResult = await db.query(
        `SELECT id, name FROM org.institutions WHERE id = $1`,
        [institutionId]
      );

      if (instResult.rows.length === 0) {
        res.status(404).json({
          status: 'error',
          message: 'Institution not found'
        });
        return;
      }

      const institution = instResult.rows[0];

      // Check if user already exists with this email
      const userCheck = await db.query(
        `SELECT id, role FROM identity.users WHERE email = $1`,
        [normalizedEmail]
      );

      if (userCheck.rows.length > 0) {
        res.status(409).json({
          status: 'error',
          message: 'A user with this email already exists'
        });
        return;
      }

      // Check if there's already a pending invite for this institution
      const existingInvite = await db.query(
        `SELECT id FROM identity.invites
         WHERE institution_id = $1
         AND role = 'SUPER_ADMIN'
         AND status = 'PENDING'
         AND expires_at > now()`,
        [institutionId]
      );

      if (existingInvite.rows.length > 0) {
        res.status(409).json({
          status: 'error',
          message: 'A pending Super Admin invite already exists for this institution'
        });
        return;
      }

      // Generate unique token
      const token = crypto.randomBytes(32).toString('hex');

      // Insert invite
      const inviteResult = await db.query(
        `INSERT INTO identity.invites (
          token,
          email,
          first_name,
          last_name,
          name,
          role,
          institution_id,
          permissions,
          status,
          expires_at,
          invited_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + interval '7 days', $10)
        RETURNING *`,
        [
          token,
          normalizedEmail,
          firstName,
          lastName,
          fullName,
          'SUPER_ADMIN',
          institutionId,
          JSON.stringify(['CAN_VIEW_STUDENT_PROGRESS', 'CAN_ASSIGN_INTERVIEWS', 'CAN_ASSIGN_LISTENING', 'CAN_MANAGE_STUDENTS']),
          'PENDING',
          req.user!.id
        ]
      );

      const invite = inviteResult.rows[0];

      // Send Super Admin invitation email
      try {
        await sendSuperAdminInvitationEmail({
          to: normalizedEmail,
          firstName,
          lastName,
          institutionName: institution.name,
          inviteToken: token
        });
        console.log(`[owner] Super Admin invitation email sent to ${normalizedEmail} for ${institution.name}`);
      } catch (emailErr) {
        console.error('[owner] Failed to send Super Admin invitation email:', emailErr);
        // Continue execution - invitation is created even if email fails
        // In production, this should alert monitoring/support
      }

      const inviteUrl = `${env.APP_URL}/?invite_token=${token}`;

      sendSuccess(res, {
        invite: {
          id: invite.id,
          email: invite.email,
          name: invite.name,
          role: invite.role,
          institutionId: invite.institution_id,
          institutionName: institution.name,
          status: invite.status,
          expiresAt: invite.expires_at,
          createdAt: invite.created_at
        },
        inviteUrl,
        message: 'Invitation created and email sent successfully'
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── GET /api/owner/invites ────────────────────────────────────────────────────
// List all invites (with filters)
ownerRouter.get(
  '/invites',
  requirePlatformOwner,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const statusFilter = (req.query.status as string) ?? null;
      const institutionIdFilter = (req.query.institution_id as string) ?? null;
      const roleFilter = (req.query.role as string) ?? null;

      let query = `
        SELECT
          i.*,
          inst.name as institution_name
        FROM identity.invites i
        LEFT JOIN org.institutions inst ON i.institution_id = inst.id
        WHERE 1=1
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (statusFilter) {
        query += ` AND i.status = $${paramIndex}`;
        params.push(statusFilter);
        paramIndex++;
      }

      if (institutionIdFilter) {
        query += ` AND i.institution_id = $${paramIndex}`;
        params.push(institutionIdFilter);
        paramIndex++;
      }

      if (roleFilter) {
        query += ` AND i.role = $${paramIndex}`;
        params.push(roleFilter);
        paramIndex++;
      }

      query += ` ORDER BY i.created_at DESC LIMIT 100`;

      const { rows } = await db.query(query, params);

      const invites = rows.map(row => ({
        id: row.id,
        token: row.token,
        email: row.email,
        first_name: row.first_name,
        last_name: row.last_name,
        name: row.name,
        role: row.role,
        institution_id: row.institution_id,
        institution_name: row.institution_name,
        program_id: row.program_id,
        department: row.department,
        permissions: row.permissions,
        status: row.status,
        expires_at: row.expires_at,
        accepted_by_user_id: row.accepted_by_user_id,
        created_at: row.created_at,
        accepted_at: row.accepted_at
      }));

      sendSuccess(res, { invites });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── POST /api/owner/invites/:id/resend ────────────────────────────────────────
// Re-send an invite (generate new token, extend expiry)
ownerRouter.post(
  '/invites/:id/resend',
  requirePlatformOwner,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Check if invite exists and is pending
      const inviteResult = await db.query(
        `SELECT * FROM identity.invites WHERE id = $1`,
        [id]
      );

      if (inviteResult.rows.length === 0) {
        res.status(404).json({
          status: 'error',
          message: 'Invite not found'
        });
        return;
      }

      const invite = inviteResult.rows[0];

      if (invite.status !== 'PENDING') {
        res.status(400).json({
          status: 'error',
          message: 'Can only resend pending invites'
        });
        return;
      }

      // Generate new token
      const newToken = crypto.randomBytes(32).toString('hex');

      // Update invite
      const updateResult = await db.query(
        `UPDATE identity.invites
         SET token = $1,
             expires_at = now() + interval '7 days',
             updated_at = now()
         WHERE id = $2
         RETURNING *`,
        [newToken, id]
      );

      const updatedInvite = updateResult.rows[0];

      // Get institution name for email
      const instResult = await db.query(
        `SELECT name FROM org.institutions WHERE id = $1`,
        [updatedInvite.institution_id]
      );
      const institutionName = instResult.rows[0]?.name || 'Your Institution';

      // Resend invitation email
      try {
        await sendSuperAdminInvitationEmail({
          to: updatedInvite.email,
          firstName: updatedInvite.first_name || '',
          lastName: updatedInvite.last_name || '',
          institutionName,
          inviteToken: newToken
        });
        console.log(`[owner] Resent invitation email to ${updatedInvite.email}`);
      } catch (emailErr) {
        console.error('[owner] Failed to resend invitation email:', emailErr);
        // Continue - invitation is updated even if email fails
      }

      const inviteUrl = `${env.APP_URL}/?invite_token=${newToken}`;

      sendSuccess(res, {
        invite: {
          id: updatedInvite.id,
          email: updatedInvite.email,
          name: updatedInvite.name,
          role: updatedInvite.role,
          status: updatedInvite.status,
          expiresAt: updatedInvite.expires_at
        },
        inviteUrl,
        message: 'Invitation resent successfully'
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── DELETE /api/owner/invites/:id ─────────────────────────────────────────────
// Cancel/revoke an invite
ownerRouter.delete(
  '/invites/:id',
  requirePlatformOwner,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Check if invite exists
      const inviteResult = await db.query(
        `SELECT id, status FROM identity.invites WHERE id = $1`,
        [id]
      );

      if (inviteResult.rows.length === 0) {
        res.status(404).json({
          status: 'error',
          message: 'Invite not found'
        });
        return;
      }

      const invite = inviteResult.rows[0];

      if (invite.status !== 'PENDING') {
        res.status(400).json({
          status: 'error',
          message: 'Can only cancel pending invites'
        });
        return;
      }

      // Update status to CANCELLED (for audit trail)
      await db.query(
        `UPDATE identity.invites
         SET status = 'CANCELLED',
             updated_at = now()
         WHERE id = $1`,
        [id]
      );

      sendSuccess(res, { message: 'Invite cancelled successfully' });
    } catch (err) {
      sendError(res, err);
    }
  }
);
