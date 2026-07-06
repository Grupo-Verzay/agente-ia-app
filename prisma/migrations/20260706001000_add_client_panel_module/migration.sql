INSERT INTO "Module" (
  "id",
  "label",
  "route",
  "icon",
  "showInSidebar",
  "hiddenModuleToSelector",
  "adminOnly",
  "requiresPremium",
  "allowedPlans",
  "lockedPlans",
  "order",
  "createdAt",
  "updatedAt",
  "showOnlySelectedPlans",
  "customUrl",
  "isContainer"
)
SELECT
  'f3f1b9c0-f3d5-4f69-a1c9-8d3f2f681d42',
  'Mi panel',
  '/client-panel',
  'ShieldCheckIcon',
  true,
  false,
  false,
  false,
  ARRAY[]::"Plan"[],
  ARRAY[]::"Plan"[],
  COALESCE((SELECT MAX("order") + 1 FROM "Module"), 0),
  NOW(),
  NOW(),
  false,
  NULL,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "Module" WHERE "route" = '/client-panel'
);
