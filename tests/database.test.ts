import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
await test('PostgreSQL migrations, atomic rollback and immutable approval history', async () => {
  const pg = new PGlite();
  try {
    for (const name of [
      '202609020001_initial',
      '202609020002_integrity',
      '202609030001_supervisor_archive',
    ])
      await pg.exec(
        await readFile(
          new URL(
            `../prisma/migrations/${name}/migration.sql`,
            import.meta.url,
          ),
          'utf8',
        ),
      );
    await pg.exec(`INSERT INTO "Project" (id) VALUES ('tree-project');
      INSERT INTO "ProjectSettings" ("projectId","updatedAt") VALUES ('tree-project',NOW());
      INSERT INTO "User" (id,name,role,"pinHash","pinLookup","updatedAt") VALUES ('admin','Test Administrator','ADMIN','test-hash','test-lookup',NOW());
      INSERT INTO "Zone" (id,capacity,spacing) VALUES ('A',4416,'test');
      INSERT INTO "Block" (id,"zoneId",name) VALUES ('A01','A','A01');
      INSERT INTO "WorkPackage" (id,name,weight,"order") VALUES ('irrigation','Irrigation',25,1);
      INSERT INTO "Activity" (id,"packageId",name,unit,"targetKey",weight) VALUES ('pipe','irrigation','Pipe','m','irrigationTarget',35);
      INSERT INTO "DailySubmission" (id,"requestKey","supervisorId","workDate","blockId","packageId","updatedAt") VALUES ('submission','request-1','admin','2026-09-02','A01','irrigation',NOW());
      INSERT INTO "DailySubmissionItem" (id,"submissionId","activityId",quantity) VALUES ('item','submission','pipe',100);`);
    await assert.rejects(
      pg.exec(
        `INSERT INTO "DailySubmissionItem" (id,"submissionId","activityId",quantity) VALUES ('bad','submission','pipe',-1)`,
      ),
    );
    await assert.rejects(
      pg.transaction(async (tx) => {
        await tx.exec(
          `INSERT INTO "Approval" (id,"submissionId","reviewerId",decision,comment,version) VALUES ('rolledback','submission','admin','APPROVED','test',1)`,
        );
        throw Error('Simulated failure before state update');
      }),
    );
    assert.equal(
      (
        await pg.query<{ count: number }>(
          'SELECT COUNT(*)::int AS count FROM "Approval"',
        )
      ).rows[0].count,
      0,
    );
    await pg.transaction(async (tx) => {
      await tx.exec(`SELECT id FROM "Project" WHERE id='tree-project' FOR UPDATE;
      INSERT INTO "Approval" (id,"submissionId","reviewerId",decision,comment,version) VALUES ('approval','submission','admin','APPROVED','checked',1);
      UPDATE "DailySubmission" SET status='APPROVED' WHERE id='submission';
      INSERT INTO "AuditLog" (id,action,"entityType") VALUES ('audit','APPROVED','Submission');`);
    });
    await assert.rejects(
      pg.exec(
        `INSERT INTO "Approval" (id,"submissionId","reviewerId",decision,comment,version) VALUES ('duplicate','submission','admin','APPROVED','again',1)`,
      ),
    );
    await assert.rejects(
      pg.exec(`UPDATE "DailySubmissionItem" SET quantity=200 WHERE id='item'`),
    );
    await assert.rejects(
      pg.exec(`DELETE FROM "DailySubmission" WHERE id='submission'`),
    );
    await assert.rejects(
      pg.exec(`UPDATE "AuditLog" SET action='ALTERED' WHERE id='audit'`),
    );
    await assert.rejects(pg.exec(`DELETE FROM "Approval" WHERE id='approval'`));
    await pg.exec(
      `INSERT INTO "Adjustment" (id,"requestKey","itemId","authorId",quantity,reason) VALUES ('adjustment','adjust-1','item','admin',-10,'Verified correction');`,
    );
    await assert.rejects(
      pg.exec(`UPDATE "Adjustment" SET quantity=0 WHERE id='adjustment'`),
    );
    const effective = await pg.query<{ total: string }>(
      `SELECT i.quantity+COALESCE(SUM(a.quantity),0) AS total FROM "DailySubmissionItem" i LEFT JOIN "Adjustment" a ON a."itemId"=i.id GROUP BY i.id`,
    );
    assert.equal(Number(effective.rows[0].total), 90);
  } finally {
    await pg.close();
  }
});
