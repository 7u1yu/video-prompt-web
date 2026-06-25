-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "storyBrief" TEXT NOT NULL DEFAULT '',
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "primaryScene" TEXT NOT NULL DEFAULT '',
    "secondaryScene" TEXT NOT NULL DEFAULT '',
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "subtitleMode" TEXT NOT NULL DEFAULT 'none',
    "stylePreset" TEXT NOT NULL DEFAULT '',
    "finalPromptMarkdown" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferenceImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "imagePath" TEXT,
    "generationStatus" TEXT NOT NULL DEFAULT 'idle',
    "quality" TEXT NOT NULL DEFAULT 'medium',
    "size" TEXT NOT NULL DEFAULT '1024x1536',
    CONSTRAINT "ReferenceImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "ReferenceImage_projectId_idx" ON "ReferenceImage"("projectId");
