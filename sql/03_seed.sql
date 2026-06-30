/* ============================================================
   INHYMA Website — Seed Data
   Migrates the original static-site content into the DB.
   Run AFTER 02_procedures.sql. Idempotent (checks by slug/key).
   NOTE: the admin user is created by the Node setup script
         (npm run db:setup) so the password is bcrypt-hashed.
   ============================================================ */

USE InhymaDB;
GO

/* ---------------- Categories & Products ----------------
   The real catalog (20 categories + 139 products + images) is
   imported from the live site by:  npm run import:inhyma
   (see src/scripts/import-inhyma.js + data/inhyma-products.json).
   No sample products are seeded here so the imported data is the
   single source of truth.
   ------------------------------------------------------------ */

/* ---------------- Industries ---------------- */
IF NOT EXISTS (SELECT 1 FROM dbo.Industries WHERE Slug='food-processing')
BEGIN
    DECLARE @iid INT;
    INSERT INTO dbo.Industries (Name, Slug, ShortDescription, Description, IconEmoji, DisplayOrder)
    VALUES ('Food Processing','food-processing',
        'Complete packaging lines for snacks, beverages, dairy, frozen foods, spices, and confectionery. Our food-grade equipment meets FDA and FSSAI standards.',
        'We provide turnkey food processing and packaging automation — from snack packaging to liquid filling, vacuum sealing and labeling.',N'🍽️',1);
    SET @iid = SCOPE_IDENTITY();
    INSERT INTO dbo.IndustryTags (IndustryId, TagText, DisplayOrder) VALUES
        (@iid,'Snack Packaging',1),(@iid,'Liquid Filling',2),(@iid,'Vacuum Sealing',3),(@iid,'Labeling',4);
END
GO

INSERT INTO dbo.Industries (Name, Slug, ShortDescription, IconEmoji, DisplayOrder)
SELECT v.Name, v.Slug, v.ShortDescription, v.IconEmoji, v.DisplayOrder
FROM (VALUES
    ('Pharmaceutical','pharmaceutical','GMP-compliant packaging and filling systems for tablets, capsules, liquids, and syrups. Clean room compatible equipment with full traceability.',N'💊',2),
    ('Cosmetics & Personal Care','cosmetics','Precision filling and labeling for beauty products, skincare, hair care, and personal care items.',N'💄',3),
    ('FMCG','fmcg','High-speed packaging automation for fast-moving consumer goods. From sachets to bulk cartons.',N'🛒',4),
    ('Chemical','chemical','Corrosion-resistant filling and packaging equipment for chemical, petrochemical, and agrochemical products.',N'🧪',5),
    ('Logistics','logistics','Conveyor, sortation and material handling systems for warehouses and distribution centers.',N'🚚',6),
    ('Manufacturing','manufacturing','End-to-end factory automation and production line optimization for manufacturers.',N'🏭',7)
) AS v(Name, Slug, ShortDescription, IconEmoji, DisplayOrder)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Industries i WHERE i.Slug = v.Slug);
GO

INSERT INTO dbo.IndustryTags (IndustryId, TagText, DisplayOrder)
SELECT i.IndustryId, x.TagText, x.DisplayOrder
FROM dbo.Industries i
CROSS APPLY (VALUES ('Automation',1),('Packaging',2),('Custom Solutions',3)) AS x(TagText, DisplayOrder)
WHERE NOT EXISTS (SELECT 1 FROM dbo.IndustryTags t WHERE t.IndustryId = i.IndustryId);
GO

/* ---------------- Solutions ---------------- */
INSERT INTO dbo.Solutions (Title, Slug, Description, ImagePath, DisplayOrder)
SELECT v.Title, v.Slug, v.Description, v.ImagePath, v.DisplayOrder
FROM (VALUES
    ('Factory Automation','factory-automation','Complete factory automation — PLC/SCADA integration, robotics, and end-to-end line control to maximize throughput.','/uploads/solutions/factory_automation.jpg',1),
    ('Packaging Automation','packaging-automation','Integrated packaging lines combining filling, sealing, labeling and cartoning for high-volume operations.','/uploads/solutions/packaging_automation.jpg',2),
    ('Warehouse Automation','warehouse-automation','Automated storage, retrieval, conveyors and sortation systems for modern warehouses.','/uploads/solutions/warehouse_automation.jpg',3),
    ('Material Handling Systems','material-handling-systems','Custom conveyors, stackers and handling equipment engineered for your material flow.','/uploads/solutions/material_handling.jpg',4),
    ('Production Line Optimization','production-line-optimization','Audit, redesign and optimize your production lines to cut waste and boost efficiency.','/uploads/solutions/production_optimization.jpg',5)
) AS v(Title, Slug, Description, ImagePath, DisplayOrder)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Solutions s WHERE s.Slug = v.Slug);
GO

/* ---------------- Blog ---------------- */
INSERT INTO dbo.BlogPosts (Title, Slug, Tag, Excerpt, Body, IconEmoji, ReadTime, PublishedDate)
SELECT v.Title, v.Slug, v.Tag, v.Excerpt, v.Body, v.IconEmoji, v.ReadTime, v.PublishedDate
FROM (VALUES
    ('Top 10 Packaging Automation Trends for 2025','top-10-packaging-automation-trends-2025','Packaging Trends','Discover the latest trends shaping the future of industrial packaging automation.','<p>The packaging industry is evolving rapidly. Here are the top trends to watch in 2025.</p>',N'📦','5 min read','2025-06-15'),
    ('How to Choose the Right Filling Machine for Your Business','how-to-choose-filling-machine','Buying Guide','A comprehensive guide covering liquid, paste, and powder filling machines.','<p>Choosing the right filling machine depends on capacity, accuracy, and budget.</p>',N'🤖','8 min read','2025-06-08'),
    ('ROI of Packaging Automation: What to Expect','roi-of-packaging-automation','Case Study','Real-world data on the return on investment after implementing automation.','<p>Automation typically pays back within 12-24 months.</p>',N'📊','6 min read','2025-05-28'),
    ('India''s Manufacturing Sector: Growth Outlook 2025-2030','india-manufacturing-growth-outlook','Industry News','Analysis of India''s manufacturing growth trajectory.','<p>India''s manufacturing sector is poised for strong growth.</p>',N'🏭','7 min read','2025-05-20'),
    ('5 Signs Your Factory Needs Automation','5-signs-your-factory-needs-automation','Automation Insights','Key indicators that it''s time to invest in automation.','<p>From quality issues to labor shortages, here are the signs.</p>',N'⚡','5 min read','2025-05-12'),
    ('Conveyor Systems Buyer''s Guide','conveyor-systems-buyers-guide','Buying Guide','Everything you need to know about choosing the right conveyor system.','<p>Types, selection criteria and maintenance for conveyor systems.</p>',N'🔧','10 min read','2025-05-05')
) AS v(Title, Slug, Tag, Excerpt, Body, IconEmoji, ReadTime, PublishedDate)
WHERE NOT EXISTS (SELECT 1 FROM dbo.BlogPosts b WHERE b.Slug = v.Slug);
GO

/* ---------------- Team ---------------- */
INSERT INTO dbo.TeamMembers (Name, Role, Initials, DisplayOrder)
SELECT v.Name, v.Role, v.Initials, v.DisplayOrder
FROM (VALUES
    ('Founder','Managing Director','FK',1),
    ('Co-Founder','Operations Director','VK',2)
) AS v(Name, Role, Initials, DisplayOrder)
WHERE NOT EXISTS (SELECT 1 FROM dbo.TeamMembers t WHERE t.Name = v.Name AND t.Role = v.Role);
GO

/* ---------------- Core Values ---------------- */
INSERT INTO dbo.CoreValues (Icon, Title, Body, DisplayOrder)
SELECT v.Icon, v.Title, v.Body, v.DisplayOrder
FROM (VALUES
    (N'🤝','Trust','Building lasting relationships through transparency and reliability.',1),
    (N'⚡','Innovation','Constantly evolving with cutting-edge technology and solutions.',2),
    (N'🏆','Quality','Delivering only the highest quality equipment and service.',3),
    (N'🎯','Customer First','Every decision is guided by what''s best for our customers.',4),
    (N'🔧','Support','Comprehensive after-sales support that goes above and beyond.',5),
    (N'🌱','Growth','Enabling our clients'' business growth with scalable solutions.',6)
) AS v(Icon, Title, Body, DisplayOrder)
WHERE NOT EXISTS (SELECT 1 FROM dbo.CoreValues c WHERE c.Title = v.Title);
GO

/* ---------------- Stats ---------------- */
INSERT INTO dbo.Stats (Label, Value, Suffix, DisplayOrder)
SELECT v.Label, v.Value, v.Suffix, v.DisplayOrder
FROM (VALUES
    ('Happy Clients',500,'+',1),
    ('Machines Installed',5000,'+',2),
    ('Cities Served',20,'+',3),
    ('Retention Rate',95,'%',4)
) AS v(Label, Value, Suffix, DisplayOrder)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Stats s WHERE s.Label = v.Label);
GO

/* ---------------- Testimonials ---------------- */
INSERT INTO dbo.Testimonials (AuthorName, AuthorRole, Initials, Rating, Content, DisplayOrder)
SELECT v.AuthorName, v.AuthorRole, v.Initials, v.Rating, v.Content, v.DisplayOrder
FROM (VALUES
    ('Rajesh Mehta', 'Director, Pioneer Foods', 'RM', 5, 'Inhyma''s automatic packing machines have doubled our production efficiency. Outstanding service and support!', 1),
    ('Dr. Amit Shah', 'Operations Head, BioPharma India', 'AS', 5, 'Highly reliable GMP-compliant filling systems. Their team''s technical expertise and post-sales support are top-notch.', 2),
    ('Sarah Jenkins', 'Logistics Manager, Apex Logistics', 'SJ', 5, 'The custom conveyor sortation system provided by Inhyma streamlined our warehouse operations completely. Highly recommended!', 3)
) AS v(AuthorName, AuthorRole, Initials, Rating, Content, DisplayOrder)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Testimonials t WHERE t.AuthorName = v.AuthorName);
GO

/* ---------------- Site Settings ---------------- */
MERGE dbo.SiteSettings AS t
USING (VALUES
    ('company_name','INHYMA Solutions LLP','general','Company Name'),
    ('tagline','Your Industrial Hyper Market','general','Tagline'),
    ('phone','+91 83558 96311','contact','Phone'),
    ('email','inhymasolutionsdm@gmail.com','contact','Email'),
    ('whatsapp','918355896311','contact','WhatsApp Number'),
    ('address','Office No.42, Lodha Supremus, Wagle Estate, Thane West - 400064','contact','Address'),
    ('social_linkedin','#','social','LinkedIn URL'),
    ('social_instagram','#','social','Instagram URL'),
    ('social_youtube','#','social','YouTube URL'),
    ('social_facebook','#','social','Facebook URL'),
    ('social_twitter','#','social','Twitter / X URL'),
    ('hero_title','India''s Industrial Hyper Market','hero','Hero Title'),
    ('hero_subtitle','Innovative packaging machinery, material handling equipment, and automation systems that drive business growth.','hero','Hero Subtitle'),
    ('footer_about','INHYMA Solutions LLP is India''s leading industrial hyper market providing innovative packaging machinery, material handling equipment, and automation systems to businesses across multiple industries.','footer','Footer About Text')
) AS s (SettingKey, SettingValue, SettingGroup, Label)
ON t.SettingKey = s.SettingKey
WHEN NOT MATCHED THEN
    INSERT (SettingKey, SettingValue, SettingGroup, Label)
    VALUES (s.SettingKey, s.SettingValue, s.SettingGroup, s.Label);
GO

PRINT 'INHYMA seed data loaded.';
GO
