/*
  Актуальный скрипт базы данных LearningPlatformDB
  Платформа электронного обучения (LMS)

  Использование:
    1. Откройте SSMS и подключитесь к SQL Server.
    2. Выполните этот скрипт целиком.
    3. Для уже существующей БД используйте backend/migration.sql.

  Дата актуализации: июнь 2026
*/

IF DB_ID(N'LearningPlatformDB') IS NULL
    CREATE DATABASE [LearningPlatformDB];
GO

USE [LearningPlatformDB];
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/* -------------------------------------------------------------------------- */
/* Таблицы                                                                    */
/* -------------------------------------------------------------------------- */

IF OBJECT_ID(N'dbo.Position', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Position](
        [Position_id] [int] IDENTITY(1,1) NOT NULL,
        [name] [nvarchar](15) NOT NULL,
        CONSTRAINT [PK_Position] PRIMARY KEY CLUSTERED ([Position_id] ASC)
    );
END
GO

IF OBJECT_ID(N'dbo.Roles', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Roles](
        [role_id] [int] IDENTITY(1,1) NOT NULL,
        [role_name] [nvarchar](20) NOT NULL,
        CONSTRAINT [PK_Roles] PRIMARY KEY CLUSTERED ([role_id] ASC),
        CONSTRAINT [UQ_Roles_role_name] UNIQUE NONCLUSTERED ([role_name] ASC)
    );
END
GO

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Users](
        [user_id] [int] IDENTITY(1,1) NOT NULL,
        [name] [nvarchar](25) NOT NULL,
        [surname] [nvarchar](25) NOT NULL,
        [patronymic] [nvarchar](25) NULL,
        [position_id] [int] NULL,
        [email] [nvarchar](50) NOT NULL,
        [password_hash] [nvarchar](256) NOT NULL,
        [photo] [nvarchar](50) NULL,
        [birthday] [date] NULL,
        [phone] [nvarchar](20) NULL,
        [status] [nvarchar](20) NOT NULL CONSTRAINT [DF_Users_status] DEFAULT (N'active'),
        CONSTRAINT [PK_Users] PRIMARY KEY CLUSTERED ([user_id] ASC),
        CONSTRAINT [UQ_Users_email] UNIQUE NONCLUSTERED ([email] ASC)
    );
END
GO

IF OBJECT_ID(N'dbo.UserRoles', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[UserRoles](
        [UserRoles_id] [int] IDENTITY(1,1) NOT NULL,
        [user_id] [int] NOT NULL,
        [role_id] [int] NOT NULL,
        CONSTRAINT [PK_UserRoles] PRIMARY KEY CLUSTERED ([UserRoles_id] ASC),
        CONSTRAINT [UQ_User_Role] UNIQUE NONCLUSTERED ([user_id] ASC, [role_id] ASC)
    );
END
GO

IF OBJECT_ID(N'dbo.Courses', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Courses](
        [course_id] [int] IDENTITY(1,1) NOT NULL,
        [title] [nvarchar](255) NOT NULL,
        [description] [nvarchar](max) NULL,
        [author_id] [int] NOT NULL,
        [date] [datetime2](7) NOT NULL CONSTRAINT [DF_Courses_date] DEFAULT (getdate()),
        [storage] [nvarchar](max) NULL,
        CONSTRAINT [PK_Courses] PRIMARY KEY CLUSTERED ([course_id] ASC)
    );
END
GO

IF OBJECT_ID(N'dbo.Assignments', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Assignments](
        [assignment_id] [int] IDENTITY(1,1) NOT NULL,
        [user_id] [int] NOT NULL,
        [course_id] [int] NOT NULL,
        [assigned_by] [int] NOT NULL,
        [date_from] [date] NOT NULL,
        [date_to] [date] NOT NULL,
        [status] [nvarchar](20) NOT NULL CONSTRAINT [DF_Assignments_status] DEFAULT (N'active'),
        [assigned_at] [datetime2](7) NOT NULL CONSTRAINT [DF_Assignments_assigned_at] DEFAULT (getdate()),
        CONSTRAINT [PK_Assignments] PRIMARY KEY CLUSTERED ([assignment_id] ASC)
    );
END
GO

IF OBJECT_ID(N'dbo.Section_progress', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Section_progress](
        [section_progress_id] [int] IDENTITY(1,1) NOT NULL,
        [assignment_id] [int] NOT NULL,
        [section_id] [nvarchar](50) NOT NULL,
        [score] [float] NOT NULL CONSTRAINT [DF_Section_progress_score] DEFAULT (0),
        [first_attempt_failed] [bit] NOT NULL CONSTRAINT [DF_Section_progress_first_attempt_failed] DEFAULT (0),
        [updated_at] [datetime2](7) NOT NULL CONSTRAINT [DF_Section_progress_updated_at] DEFAULT (getdate()),
        CONSTRAINT [PK_Section_progress] PRIMARY KEY CLUSTERED ([section_progress_id] ASC),
        CONSTRAINT [UQ_Section_progress] UNIQUE ([assignment_id], [section_id])
    );
END
GO

IF OBJECT_ID(N'dbo.User_result', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[User_result](
        [User_result_id] [int] IDENTITY(1,1) NOT NULL,
        [result] [float] NULL,
        [user_id] [int] NOT NULL,
        [course_id] [int] NOT NULL,
        [date] [date] NOT NULL,
        [assignment_id] [int] NULL,
        CONSTRAINT [PK_User_result] PRIMARY KEY CLUSTERED ([User_result_id] ASC)
    );
END
GO

IF OBJECT_ID(N'dbo.Feedback', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Feedback](
        [feedback_id] [int] IDENTITY(1,1) NOT NULL,
        [user_id] [int] NOT NULL,
        [message] [nvarchar](max) NOT NULL,
        [created_at] [datetime2](7) NOT NULL CONSTRAINT [DF_Feedback_created_at] DEFAULT (getdate()),
        CONSTRAINT [PK_Feedback] PRIMARY KEY CLUSTERED ([feedback_id] ASC)
    );
END
GO

/* -------------------------------------------------------------------------- */
/* Дополнительные столбцы (для старых версий схемы)                           */
/* -------------------------------------------------------------------------- */

IF COL_LENGTH('dbo.Users', 'birthday') IS NULL
    ALTER TABLE [dbo].[Users] ADD [birthday] [date] NULL;
GO
IF COL_LENGTH('dbo.Users', 'phone') IS NULL
    ALTER TABLE [dbo].[Users] ADD [phone] [nvarchar](20) NULL;
GO
IF COL_LENGTH('dbo.Users', 'status') IS NULL
    ALTER TABLE [dbo].[Users] ADD [status] [nvarchar](20) NOT NULL CONSTRAINT [DF_Users_status_legacy] DEFAULT (N'active');
GO
IF COL_LENGTH('dbo.User_result', 'assignment_id') IS NULL
    ALTER TABLE [dbo].[User_result] ADD [assignment_id] [int] NULL;
GO

/* -------------------------------------------------------------------------- */
/* Внешние ключи                                                              */
/* -------------------------------------------------------------------------- */

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Users_Position')
    ALTER TABLE [dbo].[Users]
        ADD CONSTRAINT [FK_Users_Position] FOREIGN KEY([position_id])
        REFERENCES [dbo].[Position]([Position_id]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_UserRoles_Users')
    ALTER TABLE [dbo].[UserRoles]
        ADD CONSTRAINT [FK_UserRoles_Users] FOREIGN KEY([user_id])
        REFERENCES [dbo].[Users]([user_id]) ON DELETE CASCADE;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_UserRoles_Roles')
    ALTER TABLE [dbo].[UserRoles]
        ADD CONSTRAINT [FK_UserRoles_Roles] FOREIGN KEY([role_id])
        REFERENCES [dbo].[Roles]([role_id]) ON DELETE CASCADE;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Courses_Author')
    ALTER TABLE [dbo].[Courses]
        ADD CONSTRAINT [FK_Courses_Author] FOREIGN KEY([author_id])
        REFERENCES [dbo].[Users]([user_id]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Assignments_Users')
    ALTER TABLE [dbo].[Assignments]
        ADD CONSTRAINT [FK_Assignments_Users] FOREIGN KEY([user_id])
        REFERENCES [dbo].[Users]([user_id]) ON DELETE CASCADE;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Assignments_Courses')
    ALTER TABLE [dbo].[Assignments]
        ADD CONSTRAINT [FK_Assignments_Courses] FOREIGN KEY([course_id])
        REFERENCES [dbo].[Courses]([course_id]) ON DELETE CASCADE;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Assignments_AssignedBy')
    ALTER TABLE [dbo].[Assignments]
        ADD CONSTRAINT [FK_Assignments_AssignedBy] FOREIGN KEY([assigned_by])
        REFERENCES [dbo].[Users]([user_id]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Section_progress_Assignments')
    ALTER TABLE [dbo].[Section_progress]
        ADD CONSTRAINT [FK_Section_progress_Assignments] FOREIGN KEY([assignment_id])
        REFERENCES [dbo].[Assignments]([assignment_id]) ON DELETE CASCADE;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_UserResult_Users')
    ALTER TABLE [dbo].[User_result]
        ADD CONSTRAINT [FK_UserResult_Users] FOREIGN KEY([user_id])
        REFERENCES [dbo].[Users]([user_id]) ON DELETE CASCADE;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_UserResult_Courses')
    ALTER TABLE [dbo].[User_result]
        ADD CONSTRAINT [FK_UserResult_Courses] FOREIGN KEY([course_id])
        REFERENCES [dbo].[Courses]([course_id]) ON DELETE CASCADE;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_UserResult_Assignments')
    ALTER TABLE [dbo].[User_result]
        ADD CONSTRAINT [FK_UserResult_Assignments] FOREIGN KEY([assignment_id])
        REFERENCES [dbo].[Assignments]([assignment_id]);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Feedback_Users')
    ALTER TABLE [dbo].[Feedback]
        ADD CONSTRAINT [FK_Feedback_Users] FOREIGN KEY([user_id])
        REFERENCES [dbo].[Users]([user_id]) ON DELETE CASCADE;
GO

/* -------------------------------------------------------------------------- */
/* Начальные данные (только если таблицы пустые)                              */
/* -------------------------------------------------------------------------- */

IF NOT EXISTS (SELECT 1 FROM [dbo].[Position])
BEGIN
    SET IDENTITY_INSERT [dbo].[Position] ON;
    INSERT INTO [dbo].[Position] ([Position_id], [name]) VALUES
        (1002, N'Разработчик'),
        (1003, N'Сис админ');
    SET IDENTITY_INSERT [dbo].[Position] OFF;
END
GO

IF NOT EXISTS (SELECT 1 FROM [dbo].[Roles])
BEGIN
    SET IDENTITY_INSERT [dbo].[Roles] ON;
    INSERT INTO [dbo].[Roles] ([role_id], [role_name]) VALUES
        (1, N'Разработчик'),
        (2, N'Эксперт'),
        (3, N'Обучающийся'),
        (4, N'Администратор');
    SET IDENTITY_INSERT [dbo].[Roles] OFF;
END
GO

IF NOT EXISTS (SELECT 1 FROM [dbo].[Users])
BEGIN
    SET IDENTITY_INSERT [dbo].[Users] ON;
    INSERT INTO [dbo].[Users]
        ([user_id], [name], [surname], [patronymic], [position_id], [email], [password_hash], [photo], [birthday], [status])
    VALUES
        (3, N'Мария', N'Иереева', N'Александровна', 1002, N'miereeva@yandex.ru', N'mashamasha', NULL, CAST(N'1990-09-28' AS date), N'active'),
        (6, N'Пётр', N'Кабков', N'Сергеевич', 1003, N'pkabkov@ra.ru', N'petya', N'user_6.png', CAST(N'1995-01-24' AS date), N'active'),
        (8, N'Воронина', N'Валерия', N'Алексеевна', 1003, N'vor.rr@va.ru', N'22222', NULL, NULL, N'active'),
        (12, N'Мария', N'Иереева', N'Александровна', 1002, N'iereevamaria', N'mariamegaadministrator', NULL, NULL, N'active');
    SET IDENTITY_INSERT [dbo].[Users] OFF;
END
GO

IF NOT EXISTS (SELECT 1 FROM [dbo].[UserRoles])
BEGIN
    SET IDENTITY_INSERT [dbo].[UserRoles] ON;
    INSERT INTO [dbo].[UserRoles] ([UserRoles_id], [user_id], [role_id]) VALUES
        (2, 3, 2),
        (3, 6, 3),
        (4, 8, 3),
        (5, 12, 4);
    SET IDENTITY_INSERT [dbo].[UserRoles] OFF;
END
GO

IF NOT EXISTS (SELECT 1 FROM [dbo].[Courses])
BEGIN
    SET IDENTITY_INSERT [dbo].[Courses] ON;
    INSERT INTO [dbo].[Courses]
        ([course_id], [title], [description], [author_id], [date], [storage])
    VALUES
        (2, N'Безопасность', N'Курс по информационной безопасности', 3, CAST(N'2024-11-11T00:00:00.0000000' AS datetime2), N'bezopasnost');
    SET IDENTITY_INSERT [dbo].[Courses] OFF;
END
GO

UPDATE [dbo].[Courses]
SET [storage] = N'bezopasnost',
    [description] = N'Курс по информационной безопасности'
WHERE [course_id] = 2
  AND ([storage] IS NULL OR [storage] <> N'bezopasnost');
GO

UPDATE [dbo].[Users]
SET [birthday] = CAST(N'1990-09-28' AS date)
WHERE [user_id] = 3 AND [birthday] IS NULL;
GO

UPDATE [dbo].[Users]
SET [birthday] = CAST(N'1995-01-24' AS date)
WHERE [user_id] = 6 AND [birthday] IS NULL;
GO

PRINT N'Скрипт LearningPlatformDB.sql выполнен успешно.';
GO
