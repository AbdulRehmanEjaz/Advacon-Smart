-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'FOREMAN');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('WAITING', 'APPROVED', 'RETURNED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'FOREMAN',
    "pinHash" TEXT NOT NULL,
    "pinLookup" TEXT NOT NULL,
    "defaultPin" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthThrottle" (
    "id" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL DEFAULT 'tree-project',
    "name" TEXT NOT NULL DEFAULT 'Trees Translocation Project',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSettings" (
    "projectId" TEXT NOT NULL,
    "designCapacity" INTEGER NOT NULL DEFAULT 13524,
    "translocationTarget" INTEGER NOT NULL DEFAULT 10000,
    "translocationTargetIsApproximate" BOOLEAN NOT NULL DEFAULT true,
    "newTreeTarget" INTEGER NOT NULL DEFAULT 3500,
    "irrigationTarget" DECIMAL(14,3) NOT NULL DEFAULT 17220,
    "blockTarget" INTEGER NOT NULL DEFAULT 19,
    "rowTarget" INTEGER NOT NULL DEFAULT 312,
    "postTarget" INTEGER NOT NULL DEFAULT 1560,
    "valveTarget" INTEGER NOT NULL DEFAULT 19,
    "decoderTarget" INTEGER NOT NULL DEFAULT 19,
    "productivityMin" INTEGER NOT NULL DEFAULT 250,
    "productivityMax" INTEGER NOT NULL DEFAULT 300,
    "amberVariance" DECIMAL(8,3) NOT NULL DEFAULT -2,
    "redVariance" DECIMAL(8,3) NOT NULL DEFAULT -5,
    "pendingHours" INTEGER NOT NULL DEFAULT 48,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSettings_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL DEFAULT 'tree-project',
    "capacity" INTEGER NOT NULL,
    "spacing" TEXT NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "irrigationTarget" DECIMAL(14,3),
    "supportRows" INTEGER,
    "hold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPackage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL DEFAULT 'tree-project',
    "name" TEXT NOT NULL,
    "weight" DECIMAL(10,6) NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "WorkPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "target" DECIMAL(14,3),
    "weight" DECIMAL(10,6) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleActivity" (
    "activityId" TEXT NOT NULL,
    "start" DATE NOT NULL,
    "finish" DATE NOT NULL,

    CONSTRAINT "ScheduleActivity_pkey" PRIMARY KEY ("activityId")
);

-- CreateTable
CREATE TABLE "DailySubmission" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "blockId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "batchNumber" TEXT,
    "remarks" TEXT NOT NULL DEFAULT '',
    "overrideReason" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'WAITING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySubmissionItem" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "DailySubmissionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionPhoto" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "SubmissionStatus" NOT NULL,
    "comment" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Adjustment" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "inspector" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "firstAttempt" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_pinLookup_key" ON "User"("pinLookup");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailySubmission_requestKey_key" ON "DailySubmission"("requestKey");

-- CreateIndex
CREATE INDEX "DailySubmission_status_createdAt_idx" ON "DailySubmission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DailySubmission_supervisorId_workDate_idx" ON "DailySubmission"("supervisorId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailySubmissionItem_submissionId_activityId_key" ON "DailySubmissionItem"("submissionId", "activityId");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_submissionId_version_key" ON "Approval"("submissionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Adjustment_requestKey_key" ON "Adjustment"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_number_key" ON "Inspection"("number");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSettings" ADD CONSTRAINT "ProjectSettings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPackage" ADD CONSTRAINT "WorkPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "WorkPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleActivity" ADD CONSTRAINT "ScheduleActivity_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySubmission" ADD CONSTRAINT "DailySubmission_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySubmission" ADD CONSTRAINT "DailySubmission_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySubmission" ADD CONSTRAINT "DailySubmission_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "WorkPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySubmissionItem" ADD CONSTRAINT "DailySubmissionItem_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DailySubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySubmissionItem" ADD CONSTRAINT "DailySubmissionItem_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionPhoto" ADD CONSTRAINT "SubmissionPhoto_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DailySubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DailySubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DailySubmissionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Adjustment" ADD CONSTRAINT "Adjustment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
