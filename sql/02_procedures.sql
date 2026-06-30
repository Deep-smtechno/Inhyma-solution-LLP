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
CREATE OR ALTER PROCEDURE dbo.usp_User_GetByLogin
    @Login NVARCHAR(160)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 1 UserId, Username, Email, PasswordHash, FullName, Role, IsActive, LastLoginAt, CreatedAt
    FROM dbo.Users
    WHERE (Username = @Login OR Email = @Login);
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_User_GetById
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT UserId, Username, Email, PasswordHash, FullName, Role, IsActive, LastLoginAt, CreatedAt
    FROM dbo.Users WHERE UserId = @UserId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_User_Create
    @Username NVARCHAR(60),
    @Email NVARCHAR(160),
    @PasswordHash NVARCHAR(255),
    @FullName NVARCHAR(120) = NULL,
    @Role NVARCHAR(30) = 'admin'
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Users (Username, Email, PasswordHash, FullName, Role)
    VALUES (@Username, @Email, @PasswordHash, @FullName, @Role);
    SELECT SCOPE_IDENTITY() AS UserId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_User_Count
AS
BEGIN
    SET NOCOUNT ON;
    SELECT COUNT(*) AS Cnt FROM dbo.Users;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_User_UpdateLastLogin
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Users SET LastLoginAt = SYSUTCDATETIME() WHERE UserId = @UserId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_User_UpdatePassword
    @UserId INT,
    @PasswordHash NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Users SET PasswordHash = @PasswordHash WHERE UserId = @UserId;
END
GO

/* ============================================================
   CATEGORIES
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Category_GetAll
    @IncludeInactive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
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
GO

CREATE OR ALTER PROCEDURE dbo.usp_Category_GetById
    @CategoryId INT
AS
BEGIN
    SET NOCOUNT ON;
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
GO

CREATE OR ALTER PROCEDURE dbo.usp_Category_Create
    @Name NVARCHAR(120),
    @Slug NVARCHAR(140),
    @Description NVARCHAR(500) = NULL,
    @ImagePath NVARCHAR(400) = NULL,
    @DisplayOrder INT = 0,
    @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Categories (Name, Slug, Description, ImagePath, DisplayOrder, IsActive)
    VALUES (@Name, @Slug, @Description, @ImagePath, @DisplayOrder, @IsActive);
    SELECT SCOPE_IDENTITY() AS CategoryId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Category_Update
    @CategoryId INT,
    @Name NVARCHAR(120),
    @Slug NVARCHAR(140),
    @Description NVARCHAR(500) = NULL,
    @ImagePath NVARCHAR(400) = NULL,
    @DisplayOrder INT = 0,
    @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Categories
    SET Name = @Name, Slug = @Slug, Description = @Description,
        ImagePath = COALESCE(@ImagePath, ImagePath),
        DisplayOrder = @DisplayOrder, IsActive = @IsActive, UpdatedAt = SYSUTCDATETIME()
    WHERE CategoryId = @CategoryId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Category_Delete
    @CategoryId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.Categories WHERE CategoryId = @CategoryId;
END
GO

/* ============================================================
   PRODUCTS
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Product_GetAll
    @CategorySlug NVARCHAR(140) = NULL,
    @Search NVARCHAR(200) = NULL,
    @IncludeInactive BIT = 0,
    @FeaturedOnly BIT = 0,
    @Top INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
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
GO

CREATE OR ALTER PROCEDURE dbo.usp_Product_GetById
    @ProductId INT
AS
BEGIN
    SET NOCOUNT ON;
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
GO

CREATE OR ALTER PROCEDURE dbo.usp_Product_GetBySlug
    @Slug NVARCHAR(220)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ProductId INT = (SELECT ProductId FROM dbo.Products WHERE Slug = @Slug);
    IF @ProductId IS NULL RETURN;
    EXEC dbo.usp_Product_GetById @ProductId = @ProductId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Product_GetRelated
    @ProductId INT,
    @Top INT = 3
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @CategoryId INT = (SELECT CategoryId FROM dbo.Products WHERE ProductId = @ProductId);
    SELECT TOP (@Top)
        p.ProductId, p.Name, p.Slug, p.CategoryLabel, p.Badge,
        (SELECT TOP 1 pi.FilePath FROM dbo.ProductImages pi
            WHERE pi.ProductId = p.ProductId ORDER BY pi.IsPrimary DESC, pi.DisplayOrder) AS PrimaryImage
    FROM dbo.Products p
    WHERE p.IsActive = 1 AND p.ProductId <> @ProductId
      AND (@CategoryId IS NULL OR p.CategoryId = @CategoryId)
    ORDER BY p.DisplayOrder, NEWID();
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Product_Create
    @CategoryId INT = NULL,
    @Name NVARCHAR(200),
    @Slug NVARCHAR(220),
    @CategoryLabel NVARCHAR(120) = NULL,
    @ShortDescription NVARCHAR(600) = NULL,
    @Description NVARCHAR(MAX) = NULL,
    @Badge NVARCHAR(60) = NULL,
    @IsFeatured BIT = 0,
    @IsActive BIT = 1,
    @DisplayOrder INT = 0
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Products (CategoryId, Name, Slug, CategoryLabel, ShortDescription, Description, Badge, IsFeatured, IsActive, DisplayOrder)
    VALUES (@CategoryId, @Name, @Slug, @CategoryLabel, @ShortDescription, @Description, @Badge, @IsFeatured, @IsActive, @DisplayOrder);
    SELECT SCOPE_IDENTITY() AS ProductId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Product_Update
    @ProductId INT,
    @CategoryId INT = NULL,
    @Name NVARCHAR(200),
    @Slug NVARCHAR(220),
    @CategoryLabel NVARCHAR(120) = NULL,
    @ShortDescription NVARCHAR(600) = NULL,
    @Description NVARCHAR(MAX) = NULL,
    @Badge NVARCHAR(60) = NULL,
    @IsFeatured BIT = 0,
    @IsActive BIT = 1,
    @DisplayOrder INT = 0
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Products
    SET CategoryId = @CategoryId, Name = @Name, Slug = @Slug, CategoryLabel = @CategoryLabel,
        ShortDescription = @ShortDescription, Description = @Description, Badge = @Badge,
        IsFeatured = @IsFeatured, IsActive = @IsActive, DisplayOrder = @DisplayOrder,
        UpdatedAt = SYSUTCDATETIME()
    WHERE ProductId = @ProductId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Product_Delete
    @ProductId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.Products WHERE ProductId = @ProductId;
END
GO

/* ---- Product child collections ---- */
CREATE OR ALTER PROCEDURE dbo.usp_ProductFeature_Create
    @ProductId INT, @FeatureText NVARCHAR(160), @DisplayOrder INT = 0
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.ProductFeatures (ProductId, FeatureText, DisplayOrder)
    VALUES (@ProductId, @FeatureText, @DisplayOrder);
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_ProductFeature_DeleteByProduct
    @ProductId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.ProductFeatures WHERE ProductId = @ProductId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_ProductSpec_Create
    @ProductId INT, @SpecName NVARCHAR(160), @SpecValue NVARCHAR(400), @DisplayOrder INT = 0
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.ProductSpecs (ProductId, SpecName, SpecValue, DisplayOrder)
    VALUES (@ProductId, @SpecName, @SpecValue, @DisplayOrder);
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_ProductSpec_DeleteByProduct
    @ProductId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.ProductSpecs WHERE ProductId = @ProductId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_ProductApp_Create
    @ProductId INT, @AppText NVARCHAR(160), @DisplayOrder INT = 0
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.ProductApplications (ProductId, AppText, DisplayOrder)
    VALUES (@ProductId, @AppText, @DisplayOrder);
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_ProductApp_DeleteByProduct
    @ProductId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.ProductApplications WHERE ProductId = @ProductId;
END
GO

/* ---- Product images ---- */
CREATE OR ALTER PROCEDURE dbo.usp_ProductImage_Create
    @ProductId INT, @FilePath NVARCHAR(400), @FileName NVARCHAR(260) = NULL,
    @AltText NVARCHAR(200) = NULL, @IsPrimary BIT = 0, @DisplayOrder INT = 0
AS
BEGIN
    SET NOCOUNT ON;
    IF @IsPrimary = 1
        UPDATE dbo.ProductImages SET IsPrimary = 0 WHERE ProductId = @ProductId;
    INSERT INTO dbo.ProductImages (ProductId, FilePath, FileName, AltText, IsPrimary, DisplayOrder)
    VALUES (@ProductId, @FilePath, @FileName, @AltText, @IsPrimary, @DisplayOrder);
    SELECT SCOPE_IDENTITY() AS ImageId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_ProductImage_GetByProduct
    @ProductId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ImageId, ProductId, FilePath, FileName, AltText, IsPrimary, DisplayOrder
    FROM dbo.ProductImages WHERE ProductId = @ProductId
    ORDER BY IsPrimary DESC, DisplayOrder, ImageId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_ProductImage_GetById
    @ImageId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ImageId, ProductId, FilePath, FileName, AltText, IsPrimary, DisplayOrder
    FROM dbo.ProductImages WHERE ImageId = @ImageId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_ProductImage_Delete
    @ImageId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.ProductImages WHERE ImageId = @ImageId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_ProductImage_SetPrimary
    @ImageId INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ProductId INT = (SELECT ProductId FROM dbo.ProductImages WHERE ImageId = @ImageId);
    UPDATE dbo.ProductImages SET IsPrimary = 0 WHERE ProductId = @ProductId;
    UPDATE dbo.ProductImages SET IsPrimary = 1 WHERE ImageId = @ImageId;
END
GO

/* ============================================================
   INDUSTRIES
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Industry_GetAll
    @IncludeInactive BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SELECT IndustryId, Name, Slug, ShortDescription, IconEmoji, ImagePath, DisplayOrder, IsActive
    FROM dbo.Industries
    WHERE (@IncludeInactive = 1 OR IsActive = 1)
    ORDER BY DisplayOrder, Name;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Industry_GetById
    @IndustryId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT IndustryId, Name, Slug, ShortDescription, Description, IconEmoji, ImagePath, DisplayOrder, IsActive
    FROM dbo.Industries WHERE IndustryId = @IndustryId;

    SELECT TagId, TagText, DisplayOrder FROM dbo.IndustryTags
    WHERE IndustryId = @IndustryId ORDER BY DisplayOrder, TagId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Industry_GetBySlug
    @Slug NVARCHAR(180)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Id INT = (SELECT IndustryId FROM dbo.Industries WHERE Slug = @Slug);
    IF @Id IS NULL RETURN;
    EXEC dbo.usp_Industry_GetById @IndustryId = @Id;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Industry_Create
    @Name NVARCHAR(160), @Slug NVARCHAR(180), @ShortDescription NVARCHAR(800) = NULL,
    @Description NVARCHAR(MAX) = NULL, @IconEmoji NVARCHAR(20) = NULL,
    @ImagePath NVARCHAR(400) = NULL, @DisplayOrder INT = 0, @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Industries (Name, Slug, ShortDescription, Description, IconEmoji, ImagePath, DisplayOrder, IsActive)
    VALUES (@Name, @Slug, @ShortDescription, @Description, @IconEmoji, @ImagePath, @DisplayOrder, @IsActive);
    SELECT SCOPE_IDENTITY() AS IndustryId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Industry_Update
    @IndustryId INT, @Name NVARCHAR(160), @Slug NVARCHAR(180), @ShortDescription NVARCHAR(800) = NULL,
    @Description NVARCHAR(MAX) = NULL, @IconEmoji NVARCHAR(20) = NULL,
    @ImagePath NVARCHAR(400) = NULL, @DisplayOrder INT = 0, @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Industries
    SET Name = @Name, Slug = @Slug, ShortDescription = @ShortDescription, Description = @Description,
        IconEmoji = @IconEmoji, ImagePath = COALESCE(@ImagePath, ImagePath),
        DisplayOrder = @DisplayOrder, IsActive = @IsActive, UpdatedAt = SYSUTCDATETIME()
    WHERE IndustryId = @IndustryId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Industry_Delete
    @IndustryId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.Industries WHERE IndustryId = @IndustryId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_IndustryTag_Create
    @IndustryId INT, @TagText NVARCHAR(160), @DisplayOrder INT = 0
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.IndustryTags (IndustryId, TagText, DisplayOrder)
    VALUES (@IndustryId, @TagText, @DisplayOrder);
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_IndustryTag_DeleteByIndustry
    @IndustryId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.IndustryTags WHERE IndustryId = @IndustryId;
END
GO

/* ============================================================
   SOLUTIONS
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Solution_GetAll
    @IncludeInactive BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SELECT SolutionId, Title, Slug, Description, ImagePath, DisplayOrder, IsActive
    FROM dbo.Solutions
    WHERE (@IncludeInactive = 1 OR IsActive = 1)
    ORDER BY DisplayOrder, Title;

    SELECT FeatureId, SolutionId, FeatureText, DisplayOrder
    FROM dbo.SolutionFeatures
    ORDER BY SolutionId, DisplayOrder, FeatureId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Solution_GetById
    @SolutionId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT SolutionId, Title, Slug, Description, ImagePath, DisplayOrder, IsActive
    FROM dbo.Solutions WHERE SolutionId = @SolutionId;

    SELECT FeatureId, FeatureText, DisplayOrder FROM dbo.SolutionFeatures
    WHERE SolutionId = @SolutionId ORDER BY DisplayOrder, FeatureId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Solution_Create
    @Title NVARCHAR(200), @Slug NVARCHAR(220), @Description NVARCHAR(MAX) = NULL,
    @ImagePath NVARCHAR(400) = NULL, @DisplayOrder INT = 0, @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Solutions (Title, Slug, Description, ImagePath, DisplayOrder, IsActive)
    VALUES (@Title, @Slug, @Description, @ImagePath, @DisplayOrder, @IsActive);
    SELECT SCOPE_IDENTITY() AS SolutionId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Solution_Update
    @SolutionId INT, @Title NVARCHAR(200), @Slug NVARCHAR(220), @Description NVARCHAR(MAX) = NULL,
    @ImagePath NVARCHAR(400) = NULL, @DisplayOrder INT = 0, @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Solutions
    SET Title = @Title, Slug = @Slug, Description = @Description,
        ImagePath = COALESCE(@ImagePath, ImagePath),
        DisplayOrder = @DisplayOrder, IsActive = @IsActive, UpdatedAt = SYSUTCDATETIME()
    WHERE SolutionId = @SolutionId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Solution_Delete
    @SolutionId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.Solutions WHERE SolutionId = @SolutionId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_SolutionFeature_Create
    @SolutionId INT, @FeatureText NVARCHAR(300), @DisplayOrder INT = 0
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.SolutionFeatures (SolutionId, FeatureText, DisplayOrder)
    VALUES (@SolutionId, @FeatureText, @DisplayOrder);
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_SolutionFeature_DeleteBySolution
    @SolutionId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.SolutionFeatures WHERE SolutionId = @SolutionId;
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
CREATE OR ALTER PROCEDURE dbo.usp_Team_GetAll
    @IncludeInactive BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SELECT MemberId, Name, Role, Initials, ImagePath, DisplayOrder, IsActive
    FROM dbo.TeamMembers
    WHERE (@IncludeInactive = 1 OR IsActive = 1)
    ORDER BY DisplayOrder, MemberId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Team_GetById
    @MemberId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT MemberId, Name, Role, Initials, ImagePath, DisplayOrder, IsActive
    FROM dbo.TeamMembers WHERE MemberId = @MemberId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Team_Create
    @Name NVARCHAR(120), @Role NVARCHAR(120) = NULL, @Initials NVARCHAR(8) = NULL,
    @ImagePath NVARCHAR(400) = NULL, @DisplayOrder INT = 0, @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.TeamMembers (Name, Role, Initials, ImagePath, DisplayOrder, IsActive)
    VALUES (@Name, @Role, @Initials, @ImagePath, @DisplayOrder, @IsActive);
    SELECT SCOPE_IDENTITY() AS MemberId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Team_Update
    @MemberId INT, @Name NVARCHAR(120), @Role NVARCHAR(120) = NULL, @Initials NVARCHAR(8) = NULL,
    @ImagePath NVARCHAR(400) = NULL, @DisplayOrder INT = 0, @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.TeamMembers
    SET Name = @Name, Role = @Role, Initials = @Initials,
        ImagePath = COALESCE(@ImagePath, ImagePath), DisplayOrder = @DisplayOrder, IsActive = @IsActive
    WHERE MemberId = @MemberId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Team_Delete
    @MemberId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.TeamMembers WHERE MemberId = @MemberId;
END
GO

/* ============================================================
   CORE VALUES
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Value_GetAll
    @IncludeInactive BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ValueId, Icon, Title, Body, DisplayOrder, IsActive
    FROM dbo.CoreValues
    WHERE (@IncludeInactive = 1 OR IsActive = 1)
    ORDER BY DisplayOrder, ValueId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Value_GetById
    @ValueId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT ValueId, Icon, Title, Body, DisplayOrder, IsActive FROM dbo.CoreValues WHERE ValueId = @ValueId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Value_Create
    @Icon NVARCHAR(20) = NULL, @Title NVARCHAR(120), @Body NVARCHAR(500) = NULL,
    @DisplayOrder INT = 0, @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.CoreValues (Icon, Title, Body, DisplayOrder, IsActive)
    VALUES (@Icon, @Title, @Body, @DisplayOrder, @IsActive);
    SELECT SCOPE_IDENTITY() AS ValueId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Value_Update
    @ValueId INT, @Icon NVARCHAR(20) = NULL, @Title NVARCHAR(120), @Body NVARCHAR(500) = NULL,
    @DisplayOrder INT = 0, @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.CoreValues
    SET Icon = @Icon, Title = @Title, Body = @Body, DisplayOrder = @DisplayOrder, IsActive = @IsActive
    WHERE ValueId = @ValueId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Value_Delete
    @ValueId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.CoreValues WHERE ValueId = @ValueId;
END
GO

/* ============================================================
   STATS
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Stat_GetAll
    @IncludeInactive BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SELECT StatId, Label, Value, Suffix, DisplayOrder, IsActive
    FROM dbo.Stats
    WHERE (@IncludeInactive = 1 OR IsActive = 1)
    ORDER BY DisplayOrder, StatId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Stat_GetById
    @StatId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT StatId, Label, Value, Suffix, DisplayOrder, IsActive FROM dbo.Stats WHERE StatId = @StatId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Stat_Create
    @Label NVARCHAR(120), @Value INT = 0, @Suffix NVARCHAR(10) = NULL, @DisplayOrder INT = 0, @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Stats (Label, Value, Suffix, DisplayOrder, IsActive)
    VALUES (@Label, @Value, @Suffix, @DisplayOrder, @IsActive);
    SELECT SCOPE_IDENTITY() AS StatId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Stat_Update
    @StatId INT, @Label NVARCHAR(120), @Value INT = 0, @Suffix NVARCHAR(10) = NULL, @DisplayOrder INT = 0, @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Stats
    SET Label = @Label, Value = @Value, Suffix = @Suffix, DisplayOrder = @DisplayOrder, IsActive = @IsActive
    WHERE StatId = @StatId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Stat_Delete
    @StatId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.Stats WHERE StatId = @StatId;
END
GO

/* ============================================================
   LEADS
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_Lead_Create
    @Name NVARCHAR(160), @Company NVARCHAR(200) = NULL, @Mobile NVARCHAR(40) = NULL,
    @Email NVARCHAR(160) = NULL, @Industry NVARCHAR(120) = NULL, @ProductRequirement NVARCHAR(200) = NULL,
    @Quantity NVARCHAR(80) = NULL, @Budget NVARCHAR(80) = NULL, @Subject NVARCHAR(200) = NULL,
    @Message NVARCHAR(MAX) = NULL, @Source NVARCHAR(40) = 'contact'
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Leads (Name, Company, Mobile, Email, Industry, ProductRequirement, Quantity, Budget, Subject, Message, Source)
    VALUES (@Name, @Company, @Mobile, @Email, @Industry, @ProductRequirement, @Quantity, @Budget, @Subject, @Message, @Source);
    SELECT SCOPE_IDENTITY() AS LeadId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Lead_GetAll
    @Status NVARCHAR(40) = NULL
AS
BEGIN
    SET NOCOUNT ON;
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
GO

CREATE OR ALTER PROCEDURE dbo.usp_Lead_GetById
    @LeadId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT LeadId, Name, Company, Mobile, Email, Industry, ProductRequirement, Quantity, Budget,
           Subject, Message, Source, Status, CreatedAt,
           (SELECT TOP 1 NextReminderDate 
            FROM dbo.CallLogs 
            WHERE LeadId = @LeadId AND NextReminderDate IS NOT NULL AND NextReminderDate >= SYSUTCDATETIME()
            ORDER BY NextReminderDate ASC) AS NextReminderDate
    FROM dbo.Leads WHERE LeadId = @LeadId;
END
GO

/* ============================================================
   CALL LOGS
   ============================================================ */
CREATE OR ALTER PROCEDURE dbo.usp_CallLog_Create
    @LeadId INT,
    @Notes NVARCHAR(MAX),
    @NextReminderDate DATETIME2 = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.CallLogs (LeadId, Notes, NextReminderDate)
    VALUES (@LeadId, @Notes, @NextReminderDate);
    SELECT SCOPE_IDENTITY() AS CallLogId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_CallLog_GetByLeadId
    @LeadId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CallLogId, LeadId, Notes, NextReminderDate, CreatedAt
    FROM dbo.CallLogs
    WHERE LeadId = @LeadId
    ORDER BY CreatedAt DESC;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Lead_UpdateStatus
    @LeadId INT, @Status NVARCHAR(40)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Leads SET Status = @Status WHERE LeadId = @LeadId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Lead_Delete
    @LeadId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.Leads WHERE LeadId = @LeadId;
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
CREATE OR ALTER PROCEDURE dbo.usp_Testimonial_GetAll
    @IncludeInactive BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TestimonialId, AuthorName, AuthorRole, Initials, Rating, Content, DisplayOrder, IsActive, CreatedAt
    FROM dbo.Testimonials
    WHERE (@IncludeInactive = 1 OR IsActive = 1)
    ORDER BY DisplayOrder, TestimonialId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Testimonial_GetById
    @TestimonialId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TestimonialId, AuthorName, AuthorRole, Initials, Rating, Content, DisplayOrder, IsActive, CreatedAt
    FROM dbo.Testimonials WHERE TestimonialId = @TestimonialId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Testimonial_Create
    @AuthorName NVARCHAR(120), @AuthorRole NVARCHAR(120) = NULL, @Initials NVARCHAR(8) = NULL,
    @Rating INT = 5, @Content NVARCHAR(MAX), @DisplayOrder INT = 0, @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.Testimonials (AuthorName, AuthorRole, Initials, Rating, Content, DisplayOrder, IsActive)
    VALUES (@AuthorName, @AuthorRole, @Initials, @Rating, @Content, @DisplayOrder, @IsActive);
    SELECT SCOPE_IDENTITY() AS TestimonialId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Testimonial_Update
    @TestimonialId INT, @AuthorName NVARCHAR(120), @AuthorRole NVARCHAR(120) = NULL, @Initials NVARCHAR(8) = NULL,
    @Rating INT = 5, @Content NVARCHAR(MAX), @DisplayOrder INT = 0, @IsActive BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Testimonials
    SET AuthorName = @AuthorName, AuthorRole = @AuthorRole, Initials = @Initials,
        Rating = @Rating, Content = @Content, DisplayOrder = @DisplayOrder, IsActive = @IsActive
    WHERE TestimonialId = @TestimonialId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Testimonial_Delete
    @TestimonialId INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.Testimonials WHERE TestimonialId = @TestimonialId;
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
