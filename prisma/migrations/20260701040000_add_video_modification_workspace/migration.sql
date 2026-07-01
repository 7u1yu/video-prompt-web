CREATE TABLE "VideoModificationWorkspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sourceStoryboard" TEXT NOT NULL DEFAULT '',
    "changeSummaryJson" TEXT NOT NULL DEFAULT '[]',
    "finalModificationPromptMarkdown" TEXT NOT NULL DEFAULT '',
    "referenceImagePromptsJson" TEXT NOT NULL DEFAULT '[]',
    "audioReferencesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VideoModificationWorkspace_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VideoModificationWorkspace_projectId_key"
ON "VideoModificationWorkspace"("projectId");
