/* ============================================================
   INHYMA Website — Stored Procedures
   Run AFTER 01_schema.sql.
   All application data access goes through these procedures.
   Uses CREATE OR ALTER (SQL Server 2016 SP1+).
   ============================================================ */

USE InhymaDB;
GO

/* ============================================================
   USERS
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_User_Manage
    @Action       VARCHAR(30), -- 'GET_BY_LOGIN', 'GET_BY_ID', 'CREATE', 'COUNT', 'UPDATE_LAST_LOGIN', 'UPDATE_PASSWORD'
    @UserId       INT = NULL,
    @Login        NVARCHAR(160) = NULL,
    @Username     NVARCHAR(60) = NULL,
    @Email        NVARCHAR(160) = NULL,
    @PasswordHash NVARCHAR(255) = NULL,
    @FullName     NVARCHAR(120) = NULL,
    @Role         NVARCHAR(30) = 'admin'
AS
BEGIN
    SET NOCOUNT ON;

    IF @Action = 'GET_BY_LOGIN'
    BEGIN
        SELECT TOP 1 UserId, Username, Email, PasswordHash, FullName, Role, IsActive, LastLoginAt, CreatedAt
        FROM dbo.Users
        WHERE (Username = @Login OR Email = @Login);
    END
    ELSE IF @Action = 'GET_BY_ID'
    BEGIN
        SELECT UserId, Username, Email, PasswordHash, FullName, Role, IsActive, LastLoginAt, CreatedAt
        FROM dbo.Users WHERE UserId = @UserId;
    END
    ELSE IF @Action = 'CREATE'
    BEGIN
        INSERT INTO dbo.Users (Username, Email, PasswordHash, FullName, Role)
        VALUES (@Username, @Email, @PasswordHash, @FullName, @Role);
        SELECT SCOPE_IDENTITY() AS UserId;
    END
    ELSE IF @Action = 'COUNT'
    BEGIN
        SELECT COUNT(*) AS Cnt FROM dbo.Users;
    END
    ELSE IF @Action = 'UPDATE_LAST_LOGIN'
    BEGIN
        UPDATE dbo.Users SET LastLoginAt = SYSUTCDATETIME() WHERE UserId = @UserId;
    END
    ELSE IF @Action = 'UPDATE_PASSWORD'
    BEGIN
        UPDATE dbo.Users SET PasswordHash = @PasswordHash WHERE UserId = @UserId;
    END
END
GO

/* ============================================================
   CATEGORIES
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Category_Manage
    @Action          VARCHAR(20), -- 'GET_ALL', 'GET_BY_ID', 'CREATE', 'UPDATE', 'DELETE'
    @CategoryId      INT = NULL,
    @Name            NVARCHAR(120) = NULL,
    @Slug            NVARCHAR(140) = NULL,
    @Description     NVARCHAR(500) = NULL,
    @ImagePath       NVARCHAR(400) = NULL,
    @DisplayOrder    INT = 0,
    @IsActive        BIT = 1,
    @IncludeInactive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;

    IF @Action = 'GET_ALL'
    BEGIN
        SELECT c.CategoryId, c.Name, c.Slug, c.Description,
               COALESCE(c.ImagePath, (
                   SELECT TOP 1 pi.FilePath
                   FROM dbo.Products p
                   JOIN dbo.ProductImages pi ON pi.ProductId = p.ProductId
                   WHERE p.CategoryId = c.CategoryId AND p.IsActive = 1
                   ORDER BY p.IsFeatured DESC, p.DisplayOrder, pi.IsPrimary DESC, pi.DisplayOrder
               )) AS ImagePath,
               c.DisplayOrder, c.IsActive,
               (SELECT COUNT(*) FROM dbo.Products p WHERE p.CategoryId = c.CategoryId) AS ProductCount
        FROM dbo.Categories c
        WHERE (@IncludeInactive = 1 OR c.IsActive = 1)
        ORDER BY c.DisplayOrder, c.Name;
    END
    ELSE IF @Action = 'GET_BY_ID'
    BEGIN
        SELECT c.CategoryId, c.Name, c.Slug, c.Description,
               COALESCE(c.ImagePath, (
                   SELECT TOP 1 pi.FilePath
                   FROM dbo.Products p
                   JOIN dbo.ProductImages pi ON pi.ProductId = p.ProductId
                   WHERE p.CategoryId = c.CategoryId AND p.IsActive = 1
                   ORDER BY p.IsFeatured DESC, p.DisplayOrder, pi.IsPrimary DESC, pi.DisplayOrder
               )) AS ImagePath,
               c.DisplayOrder, c.IsActive
        FROM dbo.Categories c WHERE c.CategoryId = @CategoryId;
    END
    ELSE IF @Action = 'CREATE'
    BEGIN
        INSERT INTO dbo.Categories (Name, Slug, Description, ImagePath, DisplayOrder, IsActive)
        VALUES (@Name, @Slug, @Description, @ImagePath, @DisplayOrder, @IsActive);
        SELECT SCOPE_IDENTITY() AS CategoryId;
    END
    ELSE IF @Action = 'UPDATE'
    BEGIN
        UPDATE dbo.Categories
        SET Name = @Name, Slug = @Slug, Description = @Description,
            ImagePath = COALESCE(@ImagePath, ImagePath),
            DisplayOrder = @DisplayOrder, IsActive = @IsActive, UpdatedAt = SYSUTCDATETIME()
        WHERE CategoryId = @CategoryId;
    END
    ELSE IF @Action = 'DELETE'
    BEGIN
        DELETE FROM dbo.Categories WHERE CategoryId = @CategoryId;
    END
END
GO

/* ============================================================
   PRODUCTS
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Product_Manage
    @Action           VARCHAR(30), -- 'GET_ALL', 'GET_BY_ID', 'GET_BY_SLUG', 'GET_RELATED', 'CREATE', 'UPDATE', 'DELETE', 'CREATE_FEATURE', 'DELETE_FEATURES', 'CREATE_SPEC', 'DELETE_SPECS', 'CREATE_APP', 'DELETE_APPS', 'CREATE_IMAGE', 'GET_IMAGES', 'GET_IMAGE_BY_ID', 'DELETE_IMAGE', 'SET_PRIMARY_IMAGE'
    @ProductId        INT = NULL,
    @CategoryId       INT = NULL,
    @Name             NVARCHAR(200) = NULL,
    @Slug             NVARCHAR(220) = NULL,
    @CategoryLabel    NVARCHAR(120) = NULL,
    @ShortDescription NVARCHAR(600) = NULL,
    @Description      NVARCHAR(MAX) = NULL,
    @Badge            NVARCHAR(60) = NULL,
    @IsFeatured       BIT = NULL,
    @IsActive         BIT = NULL,
    @DisplayOrder     INT = 0,
    @CategorySlug     NVARCHAR(140) = NULL,
    @Search           NVARCHAR(200) = NULL,
    @IncludeInactive  BIT = 0,
    @FeaturedOnly     BIT = 0,
    @Top              INT = NULL,
    
    -- Child lists parameters
    @FeatureText      NVARCHAR(160) = NULL,
    @SpecName         NVARCHAR(160) = NULL,
    @SpecValue        NVARCHAR(400) = NULL,
    @AppText          NVARCHAR(160) = NULL,
    
    -- Image parameters
    @ImageId          INT = NULL,
    @FilePath         NVARCHAR(400) = NULL,
    @FileName         NVARCHAR(260) = NULL,
    @AltText          NVARCHAR(200) = NULL,
    @IsPrimary        BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    IF @Action = 'GET_ALL'
    BEGIN
        SELECT TOP (COALESCE(@Top, 100000))
            p.ProductId, p.Name, p.Slug, p.CategoryLabel, p.ShortDescription, p.Badge,
            p.IsFeatured, p.IsActive, p.DisplayOrder, p.CategoryId,
            c.Name AS CategoryName, c.Slug AS CategorySlug,
            (SELECT TOP 1 pi.FilePath FROM dbo.ProductImages pi
                WHERE pi.ProductId = p.ProductId
                ORDER BY pi.IsPrimary DESC, pi.DisplayOrder, pi.ImageId) AS PrimaryImage
        FROM dbo.Products p
        LEFT JOIN dbo.Categories c ON c.CategoryId = p.CategoryId
        WHERE (@IncludeInactive = 1 OR p.IsActive = 1)
          AND (@FeaturedOnly = 0 OR p.IsFeatured = 1)
          AND (@CategorySlug IS NULL OR c.Slug = @CategorySlug)
          AND (@Search IS NULL OR p.Name LIKE '%' + @Search + '%'
               OR p.ShortDescription LIKE '%' + @Search + '%'
               OR p.CategoryLabel LIKE '%' + @Search + '%')
        ORDER BY p.DisplayOrder, p.Name;
    END
    ELSE IF @Action = 'GET_BY_ID'
    BEGIN
        SELECT p.ProductId, p.CategoryId, p.Name, p.Slug, p.CategoryLabel, p.ShortDescription,
               p.Description, p.Badge, p.IsFeatured, p.IsActive, p.DisplayOrder,
               c.Name AS CategoryName, c.Slug AS CategorySlug
        FROM dbo.Products p
        LEFT JOIN dbo.Categories c ON c.CategoryId = p.CategoryId
        WHERE p.ProductId = @ProductId;

        SELECT FeatureId, FeatureText, DisplayOrder FROM dbo.ProductFeatures
        WHERE ProductId = @ProductId ORDER BY DisplayOrder, FeatureId;

        SELECT SpecId, SpecName, SpecValue, DisplayOrder FROM dbo.ProductSpecs
        WHERE ProductId = @ProductId ORDER BY DisplayOrder, SpecId;

        SELECT AppId, AppText, DisplayOrder FROM dbo.ProductApplications
        WHERE ProductId = @ProductId ORDER BY DisplayOrder, AppId;

        SELECT ImageId, FilePath, FileName, AltText, IsPrimary, DisplayOrder FROM dbo.ProductImages
        WHERE ProductId = @ProductId ORDER BY IsPrimary DESC, DisplayOrder, ImageId;
    END
    ELSE IF @Action = 'GET_BY_SLUG'
    BEGIN
        DECLARE @SlugProductId INT = (SELECT ProductId FROM dbo.Products WHERE Slug = @Slug);
        IF @SlugProductId IS NOT NULL
        BEGIN
            EXEC dbo.usp_Product_Manage @Action = 'GET_BY_ID', @ProductId = @SlugProductId;
        END
    END
    ELSE IF @Action = 'GET_RELATED'
    BEGIN
        DECLARE @RelCategoryId INT = (SELECT CategoryId FROM dbo.Products WHERE ProductId = @ProductId);
        SELECT TOP (COALESCE(@Top, 3))
            p.ProductId, p.Name, p.Slug, p.CategoryLabel, p.Badge,
            (SELECT TOP 1 pi.FilePath FROM dbo.ProductImages pi
                WHERE pi.ProductId = p.ProductId ORDER BY pi.IsPrimary DESC, pi.DisplayOrder) AS PrimaryImage
        FROM dbo.Products p
        WHERE p.IsActive = 1 AND p.ProductId <> @ProductId
          AND (@RelCategoryId IS NULL OR p.CategoryId = @RelCategoryId)
        ORDER BY p.DisplayOrder, NEWID();
    END
    ELSE IF @Action = 'CREATE'
    BEGIN
        INSERT INTO dbo.Products (CategoryId, Name, Slug, CategoryLabel, ShortDescription, Description, Badge, IsFeatured, IsActive, DisplayOrder)
        VALUES (@CategoryId, @Name, @Slug, @CategoryLabel, @ShortDescription, @Description, @Badge, COALESCE(@IsFeatured, 0), COALESCE(@IsActive, 1), @DisplayOrder);
        SELECT SCOPE_IDENTITY() AS ProductId;
    END
    ELSE IF @Action = 'UPDATE'
    BEGIN
        UPDATE dbo.Products
        SET CategoryId = @CategoryId, Name = @Name, Slug = @Slug, CategoryLabel = @CategoryLabel,
            ShortDescription = @ShortDescription, Description = @Description, Badge = @Badge,
            IsFeatured = COALESCE(@IsFeatured, IsFeatured), IsActive = COALESCE(@IsActive, IsActive), DisplayOrder = @DisplayOrder,
            UpdatedAt = SYSUTCDATETIME()
        WHERE ProductId = @ProductId;
    END
    ELSE IF @Action = 'DELETE'
    BEGIN
        DELETE FROM dbo.Products WHERE ProductId = @ProductId;
    END
    
    -- Child actions
    ELSE IF @Action = 'CREATE_FEATURE'
    BEGIN
        INSERT INTO dbo.ProductFeatures (ProductId, FeatureText, DisplayOrder)
        VALUES (@ProductId, @FeatureText, @DisplayOrder);
    END
    ELSE IF @Action = 'DELETE_FEATURES'
    BEGIN
        DELETE FROM dbo.ProductFeatures WHERE ProductId = @ProductId;
    END
    ELSE IF @Action = 'CREATE_SPEC'
    BEGIN
        INSERT INTO dbo.ProductSpecs (ProductId, SpecName, SpecValue, DisplayOrder)
        VALUES (@ProductId, @SpecName, @SpecValue, @DisplayOrder);
    END
    ELSE IF @Action = 'DELETE_SPECS'
    BEGIN
        DELETE FROM dbo.ProductSpecs WHERE ProductId = @ProductId;
    END
    ELSE IF @Action = 'CREATE_APP'
    BEGIN
        INSERT INTO dbo.ProductApplications (ProductId, AppText, DisplayOrder)
        VALUES (@ProductId, @AppText, @DisplayOrder);
    END
    ELSE IF @Action = 'DELETE_APPS'
    BEGIN
        DELETE FROM dbo.ProductApplications WHERE ProductId = @ProductId;
    END
    
    -- Image actions
    ELSE IF @Action = 'CREATE_IMAGE'
    BEGIN
        IF @IsPrimary = 1
            UPDATE dbo.ProductImages SET IsPrimary = 0 WHERE ProductId = @ProductId;
        INSERT INTO dbo.ProductImages (ProductId, FilePath, FileName, AltText, IsPrimary, DisplayOrder)
        VALUES (@ProductId, @FilePath, @FileName, @AltText, @IsPrimary, @DisplayOrder);
        SELECT SCOPE_IDENTITY() AS ImageId;
    END
    ELSE IF @Action = 'GET_IMAGES'
    BEGIN
        SELECT ImageId, ProductId, FilePath, FileName, AltText, IsPrimary, DisplayOrder
        FROM dbo.ProductImages WHERE ProductId = @ProductId
        ORDER BY IsPrimary DESC, DisplayOrder, ImageId;
    END
    ELSE IF @Action = 'GET_IMAGE_BY_ID'
    BEGIN
        SELECT ImageId, ProductId, FilePath, FileName, AltText, IsPrimary, DisplayOrder
        FROM dbo.ProductImages WHERE ImageId = @ImageId;
    END
    ELSE IF @Action = 'DELETE_IMAGE'
    BEGIN
        DELETE FROM dbo.ProductImages WHERE ImageId = @ImageId;
    END
    ELSE IF @Action = 'SET_PRIMARY_IMAGE'
    BEGIN
        DECLARE @ImgProductId INT = (SELECT ProductId FROM dbo.ProductImages WHERE ImageId = @ImageId);
        UPDATE dbo.ProductImages SET IsPrimary = 0 WHERE ProductId = @ImgProductId;
        UPDATE dbo.ProductImages SET IsPrimary = 1 WHERE ImageId = @ImageId;
    END
END
GO

/* ============================================================
   INDUSTRIES
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Industry_Manage
    @Action           VARCHAR(20), -- 'GET_ALL', 'GET_BY_ID', 'GET_BY_SLUG', 'CREATE', 'UPDATE', 'DELETE', 'CREATE_TAG', 'DELETE_TAGS'
    @IndustryId       INT = NULL,
    @Name             NVARCHAR(160) = NULL,
    @Slug             NVARCHAR(180) = NULL,
    @ShortDescription NVARCHAR(800) = NULL,
    @Description      NVARCHAR(MAX) = NULL,
    @IconEmoji        NVARCHAR(20) = NULL,
    @ImagePath        NVARCHAR(400) = NULL,
    @DisplayOrder     INT = 0,
    @IsActive         BIT = 1,
    @IncludeInactive  BIT = 0,
    @TagText          NVARCHAR(160) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @Action = 'GET_ALL'
    BEGIN
        SELECT IndustryId, Name, Slug, ShortDescription, IconEmoji, ImagePath, DisplayOrder, IsActive
        FROM dbo.Industries
        WHERE (@IncludeInactive = 1 OR IsActive = 1)
        ORDER BY DisplayOrder, Name;
    END
    ELSE IF @Action = 'GET_BY_ID'
    BEGIN
        SELECT IndustryId, Name, Slug, ShortDescription, Description, IconEmoji, ImagePath, DisplayOrder, IsActive
        FROM dbo.Industries WHERE IndustryId = @IndustryId;

        SELECT TagId, TagText, DisplayOrder FROM dbo.IndustryTags
        WHERE IndustryId = @IndustryId ORDER BY DisplayOrder, TagId;
    END
    ELSE IF @Action = 'GET_BY_SLUG'
    BEGIN
        DECLARE @Id INT = (SELECT IndustryId FROM dbo.Industries WHERE Slug = @Slug);
        IF @Id IS NOT NULL
        BEGIN
            EXEC dbo.usp_Industry_Manage @Action = 'GET_BY_ID', @IndustryId = @Id;
        END
    END
    ELSE IF @Action = 'CREATE'
    BEGIN
        INSERT INTO dbo.Industries (Name, Slug, ShortDescription, Description, IconEmoji, ImagePath, DisplayOrder, IsActive)
        VALUES (@Name, @Slug, @ShortDescription, @Description, @IconEmoji, @ImagePath, @DisplayOrder, @IsActive);
        SELECT SCOPE_IDENTITY() AS IndustryId;
    END
    ELSE IF @Action = 'UPDATE'
    BEGIN
        UPDATE dbo.Industries
        SET Name = @Name, Slug = @Slug, ShortDescription = @ShortDescription, Description = @Description,
            IconEmoji = @IconEmoji, ImagePath = COALESCE(@ImagePath, ImagePath),
            DisplayOrder = @DisplayOrder, IsActive = @IsActive, UpdatedAt = SYSUTCDATETIME()
        WHERE IndustryId = @IndustryId;
    END
    ELSE IF @Action = 'DELETE'
    BEGIN
        DELETE FROM dbo.Industries WHERE IndustryId = @IndustryId;
    END
    ELSE IF @Action = 'CREATE_TAG'
    BEGIN
        INSERT INTO dbo.IndustryTags (IndustryId, TagText, DisplayOrder)
        VALUES (@IndustryId, @TagText, @DisplayOrder);
    END
    ELSE IF @Action = 'DELETE_TAGS'
    BEGIN
        DELETE FROM dbo.IndustryTags WHERE IndustryId = @IndustryId;
    END
END
GO

/* ============================================================
   SOLUTIONS
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Solution_Manage
    @Action          VARCHAR(20), -- 'GET_ALL', 'GET_BY_ID', 'CREATE', 'UPDATE', 'DELETE', 'CREATE_FEATURE', 'DELETE_FEATURES'
    @SolutionId      INT = NULL,
    @Title           NVARCHAR(200) = NULL,
    @Slug            NVARCHAR(220) = NULL,
    @Description     NVARCHAR(MAX) = NULL,
    @ImagePath       NVARCHAR(400) = NULL,
    @DisplayOrder    INT = 0,
    @IsActive        BIT = 1,
    @IncludeInactive BIT = 0,
    @FeatureText     NVARCHAR(300) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @Action = 'GET_ALL'
    BEGIN
        SELECT SolutionId, Title, Slug, Description, ImagePath, DisplayOrder, IsActive
        FROM dbo.Solutions
        WHERE (@IncludeInactive = 1 OR IsActive = 1)
        ORDER BY DisplayOrder, Title;

        SELECT FeatureId, SolutionId, FeatureText, DisplayOrder
        FROM dbo.SolutionFeatures
        ORDER BY SolutionId, DisplayOrder, FeatureId;
    END
    ELSE IF @Action = 'GET_BY_ID'
    BEGIN
        SELECT SolutionId, Title, Slug, Description, ImagePath, DisplayOrder, IsActive
        FROM dbo.Solutions WHERE SolutionId = @SolutionId;

        SELECT FeatureId, FeatureText, DisplayOrder FROM dbo.SolutionFeatures
        WHERE SolutionId = @SolutionId ORDER BY DisplayOrder, FeatureId;
    END
    ELSE IF @Action = 'CREATE'
    BEGIN
        INSERT INTO dbo.Solutions (Title, Slug, Description, ImagePath, DisplayOrder, IsActive)
        VALUES (@Title, @Slug, @Description, @ImagePath, @DisplayOrder, @IsActive);
        SELECT SCOPE_IDENTITY() AS SolutionId;
    END
    ELSE IF @Action = 'UPDATE'
    BEGIN
        UPDATE dbo.Solutions
        SET Title = @Title, Slug = @Slug, Description = @Description,
            ImagePath = COALESCE(@ImagePath, ImagePath),
            DisplayOrder = @DisplayOrder, IsActive = @IsActive, UpdatedAt = SYSUTCDATETIME()
        WHERE SolutionId = @SolutionId;
    END
    ELSE IF @Action = 'DELETE'
    BEGIN
        DELETE FROM dbo.Solutions WHERE SolutionId = @SolutionId;
    END
    ELSE IF @Action = 'CREATE_FEATURE'
    BEGIN
        INSERT INTO dbo.SolutionFeatures (SolutionId, FeatureText, DisplayOrder)
        VALUES (@SolutionId, @FeatureText, @DisplayOrder);
    END
    ELSE IF @Action = 'DELETE_FEATURES'
    BEGIN
        DELETE FROM dbo.SolutionFeatures WHERE SolutionId = @SolutionId;
    END
END
GO

/* ============================================================
   BLOG
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Blog_Manage
    @Action             VARCHAR(20), -- 'GET_ALL', 'GET_BY_ID', 'GET_BY_SLUG', 'GET_RELATED', 'CREATE', 'UPDATE', 'DELETE'
    @PostId             INT = NULL,
    @Title              NVARCHAR(250) = NULL,
    @Slug               NVARCHAR(270) = NULL,
    @Tag                NVARCHAR(80) = NULL,
    @Excerpt            NVARCHAR(800) = NULL,
    @Body               NVARCHAR(MAX) = NULL,
    @ImagePath          NVARCHAR(400) = NULL,
    @IconEmoji          NVARCHAR(20) = NULL,
    @ReadTime           NVARCHAR(40) = NULL,
    @Author             NVARCHAR(120) = NULL,
    @PublishedDate      DATE = NULL,
    @IsPublished        BIT = NULL,
    @IncludeUnpublished BIT = 0,
    @Top                INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @Action = 'GET_ALL'
    BEGIN
        SELECT TOP (COALESCE(@Top, 100000))
            PostId, Title, Slug, Tag, Excerpt, ImagePath, IconEmoji, ReadTime, Author, PublishedDate, IsPublished
        FROM dbo.BlogPosts
        WHERE (@IncludeUnpublished = 1 OR IsPublished = 1)
        ORDER BY PublishedDate DESC, PostId DESC;
    END
    ELSE IF @Action = 'GET_BY_ID'
    BEGIN
        SELECT PostId, Title, Slug, Tag, Excerpt, Body, ImagePath, IconEmoji, ReadTime, Author, PublishedDate, IsPublished
        FROM dbo.BlogPosts WHERE PostId = @PostId;
    END
    ELSE IF @Action = 'GET_BY_SLUG'
    BEGIN
        SELECT PostId, Title, Slug, Tag, Excerpt, Body, ImagePath, IconEmoji, ReadTime, Author, PublishedDate, IsPublished
        FROM dbo.BlogPosts WHERE Slug = @Slug;
    END
    ELSE IF @Action = 'GET_RELATED'
    BEGIN
        SELECT TOP (COALESCE(@Top, 3)) PostId, Title, Slug, Tag, IconEmoji, ImagePath, ReadTime, PublishedDate
        FROM dbo.BlogPosts
        WHERE IsPublished = 1 AND PostId <> @PostId
        ORDER BY PublishedDate DESC, PostId DESC;
    END
    ELSE IF @Action = 'CREATE'
    BEGIN
        INSERT INTO dbo.BlogPosts (Title, Slug, Tag, Excerpt, Body, ImagePath, IconEmoji, ReadTime, Author, PublishedDate, IsPublished)
        VALUES (@Title, @Slug, @Tag, @Excerpt, @Body, @ImagePath, @IconEmoji, @ReadTime, @Author, @PublishedDate, COALESCE(@IsPublished, 1));
        SELECT SCOPE_IDENTITY() AS PostId;
    END
    ELSE IF @Action = 'UPDATE'
    BEGIN
        UPDATE dbo.BlogPosts
        SET Title = @Title, Slug = @Slug, Tag = @Tag, Excerpt = @Excerpt, Body = @Body,
            ImagePath = COALESCE(@ImagePath, ImagePath), IconEmoji = @IconEmoji, ReadTime = @ReadTime,
            Author = @Author, PublishedDate = @PublishedDate, IsPublished = @IsPublished, UpdatedAt = SYSUTCDATETIME()
        WHERE PostId = @PostId;
    END
    ELSE IF @Action = 'DELETE'
    BEGIN
        DELETE FROM dbo.BlogPosts WHERE PostId = @PostId;
    END
END
GO

/* ============================================================
   TEAM MEMBERS
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Team_Manage
    @Action          VARCHAR(20), -- 'GET_ALL', 'GET_BY_ID', 'CREATE', 'UPDATE', 'DELETE'
    @MemberId        INT = NULL,
    @Name            NVARCHAR(120) = NULL,
    @Role            NVARCHAR(120) = NULL,
    @Initials        NVARCHAR(8) = NULL,
    @ImagePath       NVARCHAR(400) = NULL,
    @DisplayOrder    INT = 0,
    @IsActive        BIT = 1,
    @IncludeInactive BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    IF @Action = 'GET_ALL'
    BEGIN
        SELECT MemberId, Name, Role, Initials, ImagePath, DisplayOrder, IsActive
        FROM dbo.TeamMembers
        WHERE (@IncludeInactive = 1 OR IsActive = 1)
        ORDER BY DisplayOrder, MemberId;
    END
    ELSE IF @Action = 'GET_BY_ID'
    BEGIN
        SELECT MemberId, Name, Role, Initials, ImagePath, DisplayOrder, IsActive
        FROM dbo.TeamMembers WHERE MemberId = @MemberId;
    END
    ELSE IF @Action = 'CREATE'
    BEGIN
        INSERT INTO dbo.TeamMembers (Name, Role, Initials, ImagePath, DisplayOrder, IsActive)
        VALUES (@Name, @Role, @Initials, @ImagePath, @DisplayOrder, @IsActive);
        SELECT SCOPE_IDENTITY() AS MemberId;
    END
    ELSE IF @Action = 'UPDATE'
    BEGIN
        UPDATE dbo.TeamMembers
        SET Name = @Name, Role = @Role, Initials = @Initials,
            ImagePath = COALESCE(@ImagePath, ImagePath), DisplayOrder = @DisplayOrder, IsActive = @IsActive
        WHERE MemberId = @MemberId;
    END
    ELSE IF @Action = 'DELETE'
    BEGIN
        DELETE FROM dbo.TeamMembers WHERE MemberId = @MemberId;
    END
END
GO

/* ============================================================
   CORE VALUES
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Value_Manage
    @Action          VARCHAR(20), -- 'GET_ALL', 'GET_BY_ID', 'CREATE', 'UPDATE', 'DELETE'
    @ValueId         INT = NULL,
    @Icon            NVARCHAR(20) = NULL,
    @Title           NVARCHAR(120) = NULL,
    @Body            NVARCHAR(500) = NULL,
    @DisplayOrder    INT = 0,
    @IsActive        BIT = 1,
    @IncludeInactive BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    IF @Action = 'GET_ALL'
    BEGIN
        SELECT ValueId, Icon, Title, Body, DisplayOrder, IsActive
        FROM dbo.CoreValues
        WHERE (@IncludeInactive = 1 OR IsActive = 1)
        ORDER BY DisplayOrder, ValueId;
    END
    ELSE IF @Action = 'GET_BY_ID'
    BEGIN
        SELECT ValueId, Icon, Title, Body, DisplayOrder, IsActive FROM dbo.CoreValues WHERE ValueId = @ValueId;
    END
    ELSE IF @Action = 'CREATE'
    BEGIN
        INSERT INTO dbo.CoreValues (Icon, Title, Body, DisplayOrder, IsActive)
        VALUES (@Icon, @Title, @Body, @DisplayOrder, @IsActive);
        SELECT SCOPE_IDENTITY() AS ValueId;
    END
    ELSE IF @Action = 'UPDATE'
    BEGIN
        UPDATE dbo.CoreValues
        SET Icon = @Icon, Title = @Title, Body = @Body, DisplayOrder = @DisplayOrder, IsActive = @IsActive
        WHERE ValueId = @ValueId;
    END
    ELSE IF @Action = 'DELETE'
    BEGIN
        DELETE FROM dbo.CoreValues WHERE ValueId = @ValueId;
    END
END
GO

/* ============================================================
   STATS
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Stat_Manage
    @Action          VARCHAR(20), -- 'GET_ALL', 'GET_BY_ID', 'CREATE', 'UPDATE', 'DELETE'
    @StatId          INT = NULL,
    @Label           NVARCHAR(120) = NULL,
    @Value           INT = 0,
    @Suffix          NVARCHAR(10) = NULL,
    @DisplayOrder    INT = 0,
    @IsActive        BIT = 1,
    @IncludeInactive BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    IF @Action = 'GET_ALL'
    BEGIN
        SELECT StatId, Label, Value, Suffix, DisplayOrder, IsActive
        FROM dbo.Stats
        WHERE (@IncludeInactive = 1 OR IsActive = 1)
        ORDER BY DisplayOrder, StatId;
    END
    ELSE IF @Action = 'GET_BY_ID'
    BEGIN
        SELECT StatId, Label, Value, Suffix, DisplayOrder, IsActive FROM dbo.Stats WHERE StatId = @StatId;
    END
    ELSE IF @Action = 'CREATE'
    BEGIN
        INSERT INTO dbo.Stats (Label, Value, Suffix, DisplayOrder, IsActive)
        VALUES (@Label, @Value, @Suffix, @DisplayOrder, @IsActive);
        SELECT SCOPE_IDENTITY() AS StatId;
    END
    ELSE IF @Action = 'UPDATE'
    BEGIN
        UPDATE dbo.Stats
        SET Label = @Label, Value = @Value, Suffix = @Suffix, DisplayOrder = @DisplayOrder, IsActive = @IsActive
        WHERE StatId = @StatId;
    END
    ELSE IF @Action = 'DELETE'
    BEGIN
        DELETE FROM dbo.Stats WHERE StatId = @StatId;
    END
END
GO

/* ============================================================
   LEADS
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Lead_Manage
    @Action             VARCHAR(20), -- 'CREATE', 'GET_ALL', 'GET_BY_ID', 'UPDATE_STATUS', 'DELETE', 'CREATE_CALL_LOG', 'GET_CALL_LOGS'
    @LeadId             INT = NULL,
    @Name               NVARCHAR(160) = NULL,
    @Company            NVARCHAR(200) = NULL,
    @Mobile             NVARCHAR(40) = NULL,
    @Email              NVARCHAR(160) = NULL,
    @Industry           NVARCHAR(120) = NULL,
    @ProductRequirement NVARCHAR(200) = NULL,
    @Quantity           NVARCHAR(80) = NULL,
    @Budget             NVARCHAR(80) = NULL,
    @Subject            NVARCHAR(200) = NULL,
    @Message            NVARCHAR(MAX) = NULL,
    @Source             NVARCHAR(40) = 'contact',
    @Status             NVARCHAR(40) = NULL,
    
    -- Call Log parameters
    @Notes              NVARCHAR(MAX) = NULL,
    @NextReminderDate   DATETIME2 = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @Action = 'CREATE'
    BEGIN
        INSERT INTO dbo.Leads (Name, Company, Mobile, Email, Industry, ProductRequirement, Quantity, Budget, Subject, Message, Source)
        VALUES (@Name, @Company, @Mobile, @Email, @Industry, @ProductRequirement, @Quantity, @Budget, @Subject, @Message, @Source);
        SELECT SCOPE_IDENTITY() AS LeadId;
    END
    ELSE IF @Action = 'GET_ALL'
    BEGIN
        SELECT LeadId, Name, Company, Mobile, Email, Industry, ProductRequirement, Quantity, Budget,
               Subject, Message, Source, Status, CreatedAt,
               (SELECT TOP 1 NextReminderDate 
                FROM dbo.CallLogs 
                WHERE LeadId = L.LeadId AND NextReminderDate IS NOT NULL AND NextReminderDate >= SYSUTCDATETIME()
                ORDER BY NextReminderDate ASC) AS NextReminderDate
        FROM dbo.Leads L
        WHERE (@Status IS NULL OR Status = @Status)
        ORDER BY CreatedAt DESC;
    END
    ELSE IF @Action = 'GET_BY_ID'
    BEGIN
        SELECT LeadId, Name, Company, Mobile, Email, Industry, ProductRequirement, Quantity, Budget,
               Subject, Message, Source, Status, CreatedAt,
               (SELECT TOP 1 NextReminderDate 
                FROM dbo.CallLogs 
                WHERE LeadId = @LeadId AND NextReminderDate IS NOT NULL AND NextReminderDate >= SYSUTCDATETIME()
                ORDER BY NextReminderDate ASC) AS NextReminderDate
        FROM dbo.Leads WHERE LeadId = @LeadId;
    END
    ELSE IF @Action = 'UPDATE_STATUS'
    BEGIN
        UPDATE dbo.Leads SET Status = @Status WHERE LeadId = @LeadId;
    END
    ELSE IF @Action = 'DELETE'
    BEGIN
        DELETE FROM dbo.Leads WHERE LeadId = @LeadId;
    END
    ELSE IF @Action = 'CREATE_CALL_LOG'
    BEGIN
        INSERT INTO dbo.CallLogs (LeadId, Notes, NextReminderDate)
        VALUES (@LeadId, @Notes, @NextReminderDate);
        SELECT SCOPE_IDENTITY() AS CallLogId;
    END
    ELSE IF @Action = 'GET_CALL_LOGS'
    BEGIN
        SELECT CallLogId, LeadId, Notes, NextReminderDate, CreatedAt
        FROM dbo.CallLogs
        WHERE LeadId = @LeadId
        ORDER BY CreatedAt DESC;
    END
END
GO

/* ============================================================
   SITE SETTINGS
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Setting_GetAll
AS
BEGIN
    SET NOCOUNT ON;
    SELECT SettingId, SettingKey, SettingValue, SettingGroup, Label, UpdatedAt
    FROM dbo.SiteSettings ORDER BY SettingGroup, SettingKey;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Setting_GetByKey
    @SettingKey NVARCHAR(120)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT SettingId, SettingKey, SettingValue, SettingGroup, Label FROM dbo.SiteSettings WHERE SettingKey = @SettingKey;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Setting_Upsert
    @SettingKey NVARCHAR(120), @SettingValue NVARCHAR(MAX) = NULL,
    @SettingGroup NVARCHAR(60) = NULL, @Label NVARCHAR(160) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM dbo.SiteSettings WHERE SettingKey = @SettingKey)
        UPDATE dbo.SiteSettings
        SET SettingValue = @SettingValue,
            SettingGroup = COALESCE(@SettingGroup, SettingGroup),
            Label = COALESCE(@Label, Label),
            UpdatedAt = SYSUTCDATETIME()
        WHERE SettingKey = @SettingKey;
    ELSE
        INSERT INTO dbo.SiteSettings (SettingKey, SettingValue, SettingGroup, Label, UpdatedAt)
        VALUES (@SettingKey, @SettingValue, @SettingGroup, @Label, SYSUTCDATETIME());
END
GO

/* ============================================================
   TESTIMONIALS
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Testimonial_Manage
    @Action          VARCHAR(20), -- 'GET_ALL', 'GET_BY_ID', 'CREATE', 'UPDATE', 'DELETE'
    @TestimonialId   INT = NULL,
    @AuthorName      NVARCHAR(120) = NULL,
    @AuthorRole      NVARCHAR(120) = NULL,
    @Initials        NVARCHAR(8) = NULL,
    @Rating          INT = 5,
    @Content         NVARCHAR(MAX) = NULL,
    @DisplayOrder    INT = 0,
    @IsActive        BIT = 1,
    @IncludeInactive BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    IF @Action = 'GET_ALL'
    BEGIN
        SELECT TestimonialId, AuthorName, AuthorRole, Initials, Rating, Content, DisplayOrder, IsActive, CreatedAt
        FROM dbo.Testimonials
        WHERE (@IncludeInactive = 1 OR IsActive = 1)
        ORDER BY DisplayOrder, TestimonialId;
    END
    ELSE IF @Action = 'GET_BY_ID'
    BEGIN
        SELECT TestimonialId, AuthorName, AuthorRole, Initials, Rating, Content, DisplayOrder, IsActive, CreatedAt
        FROM dbo.Testimonials WHERE TestimonialId = @TestimonialId;
    END
    ELSE IF @Action = 'CREATE'
    BEGIN
        INSERT INTO dbo.Testimonials (AuthorName, AuthorRole, Initials, Rating, Content, DisplayOrder, IsActive)
        VALUES (@AuthorName, @AuthorRole, @Initials, @Rating, @Content, @DisplayOrder, @IsActive);
        SELECT SCOPE_IDENTITY() AS TestimonialId;
    END
    ELSE IF @Action = 'UPDATE'
    BEGIN
        UPDATE dbo.Testimonials
        SET AuthorName = @AuthorName, AuthorRole = @AuthorRole, Initials = @Initials,
            Rating = @Rating, Content = @Content, DisplayOrder = @DisplayOrder, IsActive = @IsActive
        WHERE TestimonialId = @TestimonialId;
    END
    ELSE IF @Action = 'DELETE'
    BEGIN
        DELETE FROM dbo.Testimonials WHERE TestimonialId = @TestimonialId;
    END
END
GO

/* ============================================================
   DASHBOARD
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Dashboard_Counts
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        (SELECT COUNT(*) FROM dbo.Products)                     AS Products,
        (SELECT COUNT(*) FROM dbo.Categories)                   AS Categories,
        (SELECT COUNT(*) FROM dbo.Industries)                   AS Industries,
        (SELECT COUNT(*) FROM dbo.Solutions)                    AS Solutions,
        (SELECT COUNT(*) FROM dbo.BlogPosts)                    AS BlogPosts,
        (SELECT COUNT(*) FROM dbo.Leads)                        AS Leads,
        (SELECT COUNT(*) FROM dbo.Leads WHERE Status = 'new')   AS NewLeads,
        (SELECT COUNT(*) FROM dbo.Testimonials)                 AS Testimonials;
END
GO

PRINT 'INHYMA stored procedures ready.';
GO
