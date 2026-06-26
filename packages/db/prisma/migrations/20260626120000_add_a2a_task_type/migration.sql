ALTER TABLE "A2ADelegation"
ADD COLUMN "taskType" TEXT NOT NULL DEFAULT 'creative-pack';

CREATE INDEX "A2ADelegation_scheduledPostId_downstreamServiceId_taskType_idx"
ON "A2ADelegation"("scheduledPostId", "downstreamServiceId", "taskType");

CREATE UNIQUE INDEX "A2ADelegation_post_service_task_unique"
ON "A2ADelegation"("scheduledPostId", "downstreamServiceId", "taskType")
WHERE "scheduledPostId" IS NOT NULL;
