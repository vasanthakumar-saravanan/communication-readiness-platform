import { db } from '../../shared/db/pool';

export class EligibilityService {
  // Recalculate and upsert placement eligibility for a student.
  // Called after ATTEMPT_COMPLETED and MENTOR_VERIFIED events.
  static async recalculate(studentId: string): Promise<void> {
    const client = await db.connect();
    try {
      // Mandatory checklist: count required items and how many are mentor-verified
      const { rows: cl } = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE ci.is_required)                                    AS required_total,
           COUNT(*) FILTER (WHERE ci.is_required AND cp.is_mentor_verified = TRUE)   AS required_verified,
           COALESCE(SUM(CASE WHEN cp.score IS NOT NULL THEN cp.score ELSE 0 END), 0) AS total_score,
           COALESCE(SUM(CASE WHEN ci.max_score IS NOT NULL THEN ci.max_score ELSE 0 END), 0) AS max_score
         FROM placement.checklist_items ci
         LEFT JOIN placement.checklist_progress cp
           ON cp.checklist_item_id = ci.id AND cp.student_id = $1
         WHERE ci.is_active = TRUE`,
        [studentId]
      );

      // Performance profile score (M3 owns, M4 reads)
      const { rows: perf } = await client.query(
        'SELECT overall_score FROM performance.performance_profiles WHERE student_id = $1',
        [studentId]
      );

      // Credit balance
      const { rows: credit } = await client.query(
        'SELECT balance FROM credit.credit_accounts WHERE student_id = $1',
        [studentId]
      );

      const requiredTotal    = parseInt(cl[0].required_total as string, 10);
      const requiredVerified = parseInt(cl[0].required_verified as string, 10);
      const totalScore       = parseFloat(cl[0].total_score as string);
      const maxScore         = parseFloat(cl[0].max_score as string);
      const perfScore        = perf.length > 0 ? parseFloat(perf[0].overall_score as string) : 0;
      const creditBalance    = credit.length > 0 ? parseFloat(credit[0].balance as string) : 0;

      const blockingReasons: string[] = [];
      if (requiredTotal > 0 && requiredVerified < requiredTotal) {
        blockingReasons.push(
          `${requiredTotal - requiredVerified} mandatory checklist item(s) pending mentor verification`
        );
      }
      if (perfScore < 60.0) {
        blockingReasons.push(`Performance score ${perfScore.toFixed(1)} is below the 60.0 threshold`);
      }
      if (creditBalance <= 0) {
        blockingReasons.push('Credit balance is zero or negative');
      }

      const isEligible     = blockingReasons.length === 0;
      const thresholdScore = maxScore > 0 ? maxScore * 0.75 : null;

      await client.query(
        `INSERT INTO placement.placement_eligibility
           (student_id, total_score, maximum_score, threshold_score, is_eligible,
            blocking_reasons, reason, evaluated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,now())
         ON CONFLICT (student_id) DO UPDATE SET
           total_score      = EXCLUDED.total_score,
           maximum_score    = EXCLUDED.maximum_score,
           threshold_score  = EXCLUDED.threshold_score,
           is_eligible      = EXCLUDED.is_eligible,
           blocking_reasons = EXCLUDED.blocking_reasons,
           reason           = EXCLUDED.reason,
           evaluated_at     = EXCLUDED.evaluated_at,
           updated_at       = now()`,
        [
          studentId,
          totalScore,
          maxScore || null,
          thresholdScore,
          isEligible,
          JSON.stringify(blockingReasons),
          isEligible ? 'All eligibility criteria met' : blockingReasons.join('; '),
        ]
      );
    } finally {
      client.release();
    }
  }
}
