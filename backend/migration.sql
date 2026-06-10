USE [LearningPlatformDB]
GO

IF COL_LENGTH('dbo.Users', 'birthday') IS NULL
    ALTER TABLE [dbo].[Users] ADD [birthday] [date] NULL;
GO
IF COL_LENGTH('dbo.Users', 'phone') IS NULL
    ALTER TABLE [dbo].[Users] ADD [phone] [nvarchar](20) NULL;
GO
IF COL_LENGTH('dbo.Users', 'status') IS NULL
    ALTER TABLE [dbo].[Users] ADD [status] [nvarchar](20) NOT NULL DEFAULT N'active';
GO
IF COL_LENGTH('dbo.User_result', 'assignment_id') IS NULL
    ALTER TABLE [dbo].[User_result] ADD [assignment_id] [int] NULL;
GO

IF OBJECT_ID('dbo.Assignments', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Assignments](
        [assignment_id] [int] IDENTITY(1,1) NOT NULL,
        [user_id] [int] NOT NULL,
        [course_id] [int] NOT NULL,
        [assigned_by] [int] NOT NULL,
        [date_from] [date] NOT NULL,
        [date_to] [date] NOT NULL,
        [status] [nvarchar](20) NOT NULL DEFAULT N'active',
        [assigned_at] [datetime2](7) NOT NULL DEFAULT (getdate()),
        PRIMARY KEY CLUSTERED ([assignment_id] ASC)
    );
END
GO

IF OBJECT_ID('dbo.Section_progress', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Section_progress](
        [section_progress_id] [int] IDENTITY(1,1) NOT NULL,
        [assignment_id] [int] NOT NULL,
        [section_id] [nvarchar](50) NOT NULL,
        [score] [float] NOT NULL DEFAULT 0,
        [first_attempt_failed] [bit] NOT NULL DEFAULT 0,
        [updated_at] [datetime2](7) NOT NULL DEFAULT (getdate()),
        PRIMARY KEY CLUSTERED ([section_progress_id] ASC),
        CONSTRAINT [UQ_Section_progress] UNIQUE ([assignment_id], [section_id])
    );
END
GO

IF OBJECT_ID('dbo.Feedback', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Feedback](
        [feedback_id] [int] IDENTITY(1,1) NOT NULL,
        [user_id] [int] NOT NULL,
        [message] [nvarchar](max) NOT NULL,
        [created_at] [datetime2](7) NOT NULL DEFAULT (getdate()),
        PRIMARY KEY CLUSTERED ([feedback_id] ASC)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Assignments_Users')
    ALTER TABLE [dbo].[Assignments] ADD CONSTRAINT [FK_Assignments_Users] FOREIGN KEY([user_id]) REFERENCES [dbo].[Users]([user_id]) ON DELETE CASCADE;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Assignments_Courses')
    ALTER TABLE [dbo].[Assignments] ADD CONSTRAINT [FK_Assignments_Courses] FOREIGN KEY([course_id]) REFERENCES [dbo].[Courses]([course_id]) ON DELETE CASCADE;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Assignments_AssignedBy')
    ALTER TABLE [dbo].[Assignments] ADD CONSTRAINT [FK_Assignments_AssignedBy] FOREIGN KEY([assigned_by]) REFERENCES [dbo].[Users]([user_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Section_progress_Assignments')
    ALTER TABLE [dbo].[Section_progress] ADD CONSTRAINT [FK_Section_progress_Assignments] FOREIGN KEY([assignment_id]) REFERENCES [dbo].[Assignments]([assignment_id]) ON DELETE CASCADE;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_UserResult_Assignments')
    ALTER TABLE [dbo].[User_result] ADD CONSTRAINT [FK_UserResult_Assignments] FOREIGN KEY([assignment_id]) REFERENCES [dbo].[Assignments]([assignment_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Feedback_Users')
    ALTER TABLE [dbo].[Feedback] ADD CONSTRAINT [FK_Feedback_Users] FOREIGN KEY([user_id]) REFERENCES [dbo].[Users]([user_id]) ON DELETE CASCADE;
GO

UPDATE [dbo].[Courses]
SET [storage] = N'bezopasnost',
    [description] = N'Курс по информационной безопасности'
WHERE [course_id] = 2;
GO

DELETE FROM [dbo].[Section_progress]
WHERE [assignment_id] IN (SELECT [assignment_id] FROM [dbo].[Assignments] WHERE [course_id] = 2);
GO
DELETE FROM [dbo].[User_result] WHERE [course_id] = 2;
GO
DELETE FROM [dbo].[Assignments] WHERE [course_id] = 2;
GO

UPDATE [dbo].[Users] SET [birthday] = CAST(N'1990-09-28' AS date) WHERE [user_id] = 3 AND [birthday] IS NULL;
UPDATE [dbo].[Users] SET [birthday] = CAST(N'1995-01-24' AS date) WHERE [user_id] = 6 AND [birthday] IS NULL;
GO
