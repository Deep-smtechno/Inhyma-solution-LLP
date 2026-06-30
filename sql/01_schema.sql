/* ============================================================
   INHYMA Website — Database Schema
   SQL Server (InhymaDB)
   Run this FIRST. Idempotent: safe to re-run.
   ============================================================ */

IF DB_ID('InhymaDB') IS NULL
BEGIN
    CREATE DATABASE InhymaDB;
END
GO

USE InhymaDB;
GO

/* ------------------------------------------------------------
   Admin Users (authentication)
   ------------------------------------------------------------ */
IF OBJECT_ID('dbo.Users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        UserId        INT IDENTITY(1,1) PRIMARY KEY,
        Username      NVARCHAR(60)  NOT NULL UNIQUE,
        Email         NVARCHAR(160) NOT NULL UNIQUE,
        PasswordHash  NVARCHAR(255) NOT NULL,
        FullName      NVARCHAR(120) NULL,
        Role          NVARCHAR(30)  NOT NULL CONSTRAINT DF_Users_Role DEFAULT('admin'),
        IsActive      BIT           NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT(1),
        LastLoginAt   DATETIME2     NULL,
        CreatedAt     DATETIME2     NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT(SYSUTCDATETIME())
    );
END
GO

/* ------------------------------------------------------------
   Product Categories
   ------------------------------------------------------------ */
IF OBJECT_ID('dbo.Categories', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Categories (
        CategoryId    INT IDENTITY(1,1) PRIMARY KEY,
        Name          NVARCHAR(120) NOT NULL,
        Slug          NVARCHAR(140) NOT NULL UNIQUE,
        Description   NVARCHAR(500) NULL,
        ImagePath     NVARCHAR(400) NULL,
        DisplayOrder  INT           NOT NULL CONSTRAINT DF_Categories_Order DEFAULT(0),
        IsActive      BIT           NOT NULL CONSTRAINT DF_Categories_IsActive DEFAULT(1),
        CreatedAt     DATETIME2     NOT NULL CONSTRAINT DF_Categories_CreatedAt DEFAULT(SYSUTCDATETIME()),
        UpdatedAt     DATETIME2     NULL
    );
END
GO

/* ------------------------------------------------------------
   Products
   ------------------------------------------------------------ */
IF OBJECT_ID('dbo.Products', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Products (
        ProductId        INT IDENTITY(1,1) PRIMARY KEY,
        CategoryId       INT           NULL,
        Name             NVARCHAR(200) NOT NULL,
        Slug             NVARCHAR(220) NOT NULL UNIQUE,
        CategoryLabel    NVARCHAR(120) NULL,   -- e.g. "Packaging Machines" (display text)
        ShortDescription NVARCHAR(600) NULL,
        Description      NVARCHAR(MAX) NULL,
        Badge            NVARCHAR(60)  NULL,   -- e.g. "Best Seller", "New"
        IsFeatured       BIT           NOT NULL CONSTRAINT DF_Products_Featured DEFAULT(0),
        IsActive         BIT           NOT NULL CONSTRAINT DF_Products_IsActive DEFAULT(1),
        DisplayOrder     INT           NOT NULL CONSTRAINT DF_Products_Order DEFAULT(0),
        CreatedAt        DATETIME2     NOT NULL CONSTRAINT DF_Products_CreatedAt DEFAULT(SYSUTCDATETIME()),
        UpdatedAt        DATETIME2     NULL,
        CONSTRAINT FK_Products_Categories FOREIGN KEY (CategoryId)
            REFERENCES dbo.Categories(CategoryId) ON DELETE SET NULL
    );
END
GO

/* Product feature chips (e.g. "60 PPM", "SS 304") */
IF OBJECT_ID('dbo.ProductFeatures', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProductFeatures (
        FeatureId    INT IDENTITY(1,1) PRIMARY KEY,
        ProductId    INT           NOT NULL,
        FeatureText  NVARCHAR(160) NOT NULL,
        DisplayOrder INT           NOT NULL CONSTRAINT DF_ProductFeatures_Order DEFAULT(0),
        CONSTRAINT FK_ProductFeatures_Products FOREIGN KEY (ProductId)
            REFERENCES dbo.Products(ProductId) ON DELETE CASCADE
    );
END
GO

/* Product spec table rows (Name / Value pairs) */
IF OBJECT_ID('dbo.ProductSpecs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProductSpecs (
        SpecId       INT IDENTITY(1,1) PRIMARY KEY,
        ProductId    INT           NOT NULL,
        SpecName     NVARCHAR(160) NOT NULL,
        SpecValue    NVARCHAR(400) NOT NULL,
        DisplayOrder INT           NOT NULL CONSTRAINT DF_ProductSpecs_Order DEFAULT(0),
        CONSTRAINT FK_ProductSpecs_Products FOREIGN KEY (ProductId)
            REFERENCES dbo.Products(ProductId) ON DELETE CASCADE
    );
END
GO

/* Product application chips (e.g. "Snacks", "Spices") */
IF OBJECT_ID('dbo.ProductApplications', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProductApplications (
        AppId        INT IDENTITY(1,1) PRIMARY KEY,
        ProductId    INT           NOT NULL,
        AppText      NVARCHAR(160) NOT NULL,
        DisplayOrder INT           NOT NULL CONSTRAINT DF_ProductApplications_Order DEFAULT(0),
        CONSTRAINT FK_ProductApplications_Products FOREIGN KEY (ProductId)
            REFERENCES dbo.Products(ProductId) ON DELETE CASCADE
    );
END
GO

/* Product images (files on disk, path stored here) */
IF OBJECT_ID('dbo.ProductImages', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProductImages (
        ImageId      INT IDENTITY(1,1) PRIMARY KEY,
        ProductId    INT           NOT NULL,
        FilePath     NVARCHAR(400) NOT NULL,   -- web path, e.g. /uploads/products/abc.jpg
        FileName     NVARCHAR(260) NULL,
        AltText      NVARCHAR(200) NULL,
        IsPrimary    BIT           NOT NULL CONSTRAINT DF_ProductImages_Primary DEFAULT(0),
        DisplayOrder INT           NOT NULL CONSTRAINT DF_ProductImages_Order DEFAULT(0),
        CreatedAt    DATETIME2     NOT NULL CONSTRAINT DF_ProductImages_CreatedAt DEFAULT(SYSUTCDATETIME()),
        CONSTRAINT FK_ProductImages_Products FOREIGN KEY (ProductId)
            REFERENCES dbo.Products(ProductId) ON DELETE CASCADE
    );
END
GO

/* ------------------------------------------------------------
   Industries
   ------------------------------------------------------------ */
IF OBJECT_ID('dbo.Industries', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Industries (
        IndustryId       INT IDENTITY(1,1) PRIMARY KEY,
        Name             NVARCHAR(160) NOT NULL,
        Slug             NVARCHAR(180) NOT NULL UNIQUE,
        ShortDescription NVARCHAR(800) NULL,
        Description      NVARCHAR(MAX) NULL,
        IconEmoji        NVARCHAR(20)  NULL,
        ImagePath        NVARCHAR(400) NULL,
        DisplayOrder     INT           NOT NULL CONSTRAINT DF_Industries_Order DEFAULT(0),
        IsActive         BIT           NOT NULL CONSTRAINT DF_Industries_IsActive DEFAULT(1),
        CreatedAt        DATETIME2     NOT NULL CONSTRAINT DF_Industries_CreatedAt DEFAULT(SYSUTCDATETIME()),
        UpdatedAt        DATETIME2     NULL
    );
END
GO

IF OBJECT_ID('dbo.IndustryTags', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.IndustryTags (
        TagId        INT IDENTITY(1,1) PRIMARY KEY,
        IndustryId   INT           NOT NULL,
        TagText      NVARCHAR(160) NOT NULL,
        DisplayOrder INT           NOT NULL CONSTRAINT DF_IndustryTags_Order DEFAULT(0),
        CONSTRAINT FK_IndustryTags_Industries FOREIGN KEY (IndustryId)
            REFERENCES dbo.Industries(IndustryId) ON DELETE CASCADE
    );
END
GO

/* ------------------------------------------------------------
   Solutions
   ------------------------------------------------------------ */
IF OBJECT_ID('dbo.Solutions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Solutions (
        SolutionId   INT IDENTITY(1,1) PRIMARY KEY,
        Title        NVARCHAR(200) NOT NULL,
        Slug         NVARCHAR(220) NOT NULL UNIQUE,
        Description  NVARCHAR(MAX) NULL,
        ImagePath    NVARCHAR(400) NULL,
        DisplayOrder INT           NOT NULL CONSTRAINT DF_Solutions_Order DEFAULT(0),
        IsActive     BIT           NOT NULL CONSTRAINT DF_Solutions_IsActive DEFAULT(1),
        CreatedAt    DATETIME2     NOT NULL CONSTRAINT DF_Solutions_CreatedAt DEFAULT(SYSUTCDATETIME()),
        UpdatedAt    DATETIME2     NULL
    );
END
GO

IF OBJECT_ID('dbo.SolutionFeatures', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SolutionFeatures (
        FeatureId    INT IDENTITY(1,1) PRIMARY KEY,
        SolutionId   INT           NOT NULL,
        FeatureText  NVARCHAR(300) NOT NULL,
        DisplayOrder INT           NOT NULL CONSTRAINT DF_SolutionFeatures_Order DEFAULT(0),
        CONSTRAINT FK_SolutionFeatures_Solutions FOREIGN KEY (SolutionId)
            REFERENCES dbo.Solutions(SolutionId) ON DELETE CASCADE
    );
END
GO

/* ------------------------------------------------------------
   Blog / Knowledge Center
   ------------------------------------------------------------ */
IF OBJECT_ID('dbo.BlogPosts', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BlogPosts (
        PostId        INT IDENTITY(1,1) PRIMARY KEY,
        Title         NVARCHAR(250) NOT NULL,
        Slug          NVARCHAR(270) NOT NULL UNIQUE,
        Tag           NVARCHAR(80)  NULL,
        Excerpt       NVARCHAR(800) NULL,
        Body          NVARCHAR(MAX) NULL,
        ImagePath     NVARCHAR(400) NULL,
        IconEmoji     NVARCHAR(20)  NULL,
        ReadTime      NVARCHAR(40)  NULL,
        Author        NVARCHAR(120) NULL,
        PublishedDate DATE          NULL,
        IsPublished   BIT           NOT NULL CONSTRAINT DF_BlogPosts_Published DEFAULT(1),
        CreatedAt     DATETIME2     NOT NULL CONSTRAINT DF_BlogPosts_CreatedAt DEFAULT(SYSUTCDATETIME()),
        UpdatedAt     DATETIME2     NULL
    );
END
GO

/* ------------------------------------------------------------
   About page content: Team / Values / Stats
   ------------------------------------------------------------ */
IF OBJECT_ID('dbo.TeamMembers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TeamMembers (
        MemberId     INT IDENTITY(1,1) PRIMARY KEY,
        Name         NVARCHAR(120) NOT NULL,
        Role         NVARCHAR(120) NULL,
        Initials     NVARCHAR(8)   NULL,
        ImagePath    NVARCHAR(400) NULL,
        DisplayOrder INT           NOT NULL CONSTRAINT DF_TeamMembers_Order DEFAULT(0),
        IsActive     BIT           NOT NULL CONSTRAINT DF_TeamMembers_IsActive DEFAULT(1)
    );
END
GO

IF OBJECT_ID('dbo.CoreValues', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CoreValues (
        ValueId      INT IDENTITY(1,1) PRIMARY KEY,
        Icon         NVARCHAR(20)  NULL,
        Title        NVARCHAR(120) NOT NULL,
        Body         NVARCHAR(500) NULL,
        DisplayOrder INT           NOT NULL CONSTRAINT DF_CoreValues_Order DEFAULT(0),
        IsActive     BIT           NOT NULL CONSTRAINT DF_CoreValues_IsActive DEFAULT(1)
    );
END
GO

IF OBJECT_ID('dbo.Stats', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Stats (
        StatId       INT IDENTITY(1,1) PRIMARY KEY,
        Label        NVARCHAR(120) NOT NULL,
        Value        INT           NOT NULL CONSTRAINT DF_Stats_Value DEFAULT(0),
        Suffix       NVARCHAR(10)  NULL,
        DisplayOrder INT           NOT NULL CONSTRAINT DF_Stats_Order DEFAULT(0),
        IsActive     BIT           NOT NULL CONSTRAINT DF_Stats_IsActive DEFAULT(1)
    );
END
GO

/* ------------------------------------------------------------
   Leads (contact form + quote form + industry consultation)
   ------------------------------------------------------------ */
IF OBJECT_ID('dbo.Leads', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Leads (
        LeadId             INT IDENTITY(1,1) PRIMARY KEY,
        Name               NVARCHAR(160) NOT NULL,
        Company            NVARCHAR(200) NULL,
        Mobile             NVARCHAR(40)  NULL,
        Email              NVARCHAR(160) NULL,
        Industry           NVARCHAR(120) NULL,
        ProductRequirement NVARCHAR(200) NULL,
        Quantity           NVARCHAR(80)  NULL,
        Budget             NVARCHAR(80)  NULL,
        Subject            NVARCHAR(200) NULL,
        Message            NVARCHAR(MAX) NULL,
        Source             NVARCHAR(40)  NOT NULL CONSTRAINT DF_Leads_Source DEFAULT('contact'),
        Status             NVARCHAR(40)  NOT NULL CONSTRAINT DF_Leads_Status DEFAULT('new'),
        CreatedAt          DATETIME2     NOT NULL CONSTRAINT DF_Leads_CreatedAt DEFAULT(SYSUTCDATETIME())
    );
END
GO

/* ------------------------------------------------------------
   CallLogs (CRM interactions, notes and next reminders)
   ------------------------------------------------------------ */
IF OBJECT_ID('dbo.CallLogs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CallLogs (
        CallLogId         INT IDENTITY(1,1) PRIMARY KEY,
        LeadId            INT NOT NULL FOREIGN KEY REFERENCES dbo.Leads(LeadId) ON DELETE CASCADE,
        Notes             NVARCHAR(MAX) NOT NULL,
        NextReminderDate  DATETIME2 NULL,
        CreatedAt         DATETIME2 NOT NULL CONSTRAINT DF_CallLogs_CreatedAt DEFAULT(SYSUTCDATETIME())
    );
END
GO

/* ------------------------------------------------------------
   Testimonials (client reviews)
   ------------------------------------------------------------ */
IF OBJECT_ID('dbo.Testimonials', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Testimonials (
        TestimonialId INT IDENTITY(1,1) PRIMARY KEY,
        AuthorName    NVARCHAR(120) NOT NULL,
        AuthorRole    NVARCHAR(120) NULL,   -- e.g. "CEO, FoodCorp"
        Initials      NVARCHAR(8)   NULL,   -- e.g. "RM"
        Rating        INT           NOT NULL CONSTRAINT DF_Testimonials_Rating DEFAULT(5),
        Content       NVARCHAR(MAX) NOT NULL,
        DisplayOrder  INT           NOT NULL CONSTRAINT DF_Testimonials_Order DEFAULT(0),
        IsActive      BIT           NOT NULL CONSTRAINT DF_Testimonials_IsActive DEFAULT(1),
        CreatedAt     DATETIME2     NOT NULL CONSTRAINT DF_Testimonials_CreatedAt DEFAULT(SYSUTCDATETIME())
    );
END
GO

/* ------------------------------------------------------------
   Site Settings (key/value CMS: contact info, hero text, social)
   ------------------------------------------------------------ */
IF OBJECT_ID('dbo.SiteSettings', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SiteSettings (
        SettingId    INT IDENTITY(1,1) PRIMARY KEY,
        SettingKey   NVARCHAR(120) NOT NULL UNIQUE,
        SettingValue NVARCHAR(MAX) NULL,
        SettingGroup NVARCHAR(60)  NULL,   -- e.g. contact, social, hero, about
        Label        NVARCHAR(160) NULL,
        UpdatedAt    DATETIME2     NULL
    );
END
GO

PRINT 'INHYMA schema ready.';
GO
