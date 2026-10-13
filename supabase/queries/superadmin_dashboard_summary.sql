WITH
  business_metrics AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE is_active) AS active,
      COUNT(*) FILTER (WHERE NOT is_active) AS inactive,
      COUNT(*) FILTER (
        WHERE created_at >= date_trunc('month', now())
      ) AS new_this_month
    FROM public.businesses
  ),
  business_info_metrics AS (
    SELECT
      COUNT(*) AS configured,
      COUNT(*) FILTER (WHERE rating_count > 0) AS rated,
      COUNT(*) FILTER (WHERE public_courier_enabled) AS courier_enabled
    FROM public.business_info
  ),
  subscription_metrics AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'active') AS active,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE status = 'expired') AS expired,
      COUNT(*) FILTER (WHERE status = 'suspended') AS suspended,
      COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
      COUNT(*) FILTER (
        WHERE status = 'active'
          AND ends_at >= now()
          AND ends_at < now() + interval '7 days'
      ) AS expiring_in_7_days
    FROM public.subscriptions
  ),
  payment_metrics AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE status = 'paid') AS paid,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed,
      COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
      COUNT(*) FILTER (WHERE status = 'refunded') AS refunded,
      COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS revenue_all_time,
      COALESCE(
        SUM(amount) FILTER (
          WHERE status = 'paid'
            AND paid_at >= date_trunc('month', now())
            AND paid_at < date_trunc('month', now()) + interval '1 month'
        ),
        0
      ) AS revenue_this_month
    FROM public.payment_records
  ),
  promotion_metrics AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE payment_status = 'pending') AS pending,
      COUNT(*) FILTER (
        WHERE payment_status = 'paid' AND is_active
      ) AS active_paid,
      COUNT(*) FILTER (
        WHERE payment_status = 'paid'
          AND paid_at >= date_trunc('month', now())
          AND paid_at < date_trunc('month', now()) + interval '1 month'
      ) AS paid_this_month,
      COALESCE(
        SUM(total_amount) FILTER (WHERE payment_status = 'paid'),
        0
      ) AS revenue_all_time,
      COALESCE(
        SUM(total_amount) FILTER (
          WHERE payment_status = 'paid'
            AND paid_at >= date_trunc('month', now())
            AND paid_at < date_trunc('month', now()) + interval '1 month'
        ),
        0
      ) AS revenue_this_month
    FROM public.promotions
  ),
  plan_change_metrics AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'awaiting_payment') AS awaiting_payment,
      COUNT(*) FILTER (WHERE status = 'pending_review') AS pending_review,
      COUNT(*) FILTER (
        WHERE scheduled_subscription_id IS NOT NULL
      ) AS scheduled
    FROM public.business_plan_change_requests
  ),
  notification_metrics AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE read_at IS NULL) AS unread,
      COUNT(*) FILTER (WHERE resolved_at IS NULL) AS unresolved
    FROM public.business_notifications
  ),
  plan_catalog_metrics AS (
    SELECT
      (
        SELECT COUNT(*)
        FROM public.billing_plan_periods
        WHERE is_active AND plan_is_active
      ) AS active_periods,
      (
        SELECT COUNT(*)
        FROM public.billing_plan_features
        WHERE is_active
      ) AS active_features
  ),
  courier_metrics AS (
    SELECT
      (SELECT COUNT(*) FROM public.public_courier_applications) AS applications,
      (
        SELECT COUNT(*)
        FROM public.public_courier_applications
        WHERE status = 'pending'
      ) AS pending_applications,
      (SELECT COUNT(*) FROM public.public_courier_topups) AS topups,
      (
        SELECT COUNT(*)
        FROM public.public_courier_topups
        WHERE status = 'pending'
      ) AS pending_topups
  ),
  platform_revenue_metrics AS (
    SELECT
      payments.revenue_all_time + promotions.revenue_all_time AS revenue_all_time,
      payments.revenue_this_month + promotions.revenue_this_month AS revenue_this_month
    FROM payment_metrics AS payments
    CROSS JOIN promotion_metrics AS promotions
  )
SELECT 'Negocios' AS grupo, 'Total' AS indicador, total::numeric AS valor
FROM business_metrics
UNION ALL
SELECT 'Negocios', 'Activos', active::numeric FROM business_metrics
UNION ALL
SELECT 'Negocios', 'Inactivos', inactive::numeric FROM business_metrics
UNION ALL
SELECT 'Negocios', 'Nuevos este mes', new_this_month::numeric FROM business_metrics
UNION ALL
SELECT 'Negocios', 'Con información', configured::numeric FROM business_info_metrics
UNION ALL
SELECT 'Negocios', 'Con calificaciones', rated::numeric FROM business_info_metrics
UNION ALL
SELECT 'Negocios', 'Domicilio público activo', courier_enabled::numeric FROM business_info_metrics
UNION ALL
SELECT 'Suscripciones', 'Total', total::numeric FROM subscription_metrics
UNION ALL
SELECT 'Suscripciones', 'Activas', active::numeric FROM subscription_metrics
UNION ALL
SELECT 'Suscripciones', 'Pendientes', pending::numeric FROM subscription_metrics
UNION ALL
SELECT 'Suscripciones', 'Vencidas', expired::numeric FROM subscription_metrics
UNION ALL
SELECT 'Suscripciones', 'Suspendidas', suspended::numeric FROM subscription_metrics
UNION ALL
SELECT 'Suscripciones', 'Canceladas', cancelled::numeric FROM subscription_metrics
UNION ALL
SELECT 'Suscripciones', 'Vencen en 7 días', expiring_in_7_days::numeric FROM subscription_metrics
UNION ALL
SELECT 'Pagos', 'Registrados', total::numeric FROM payment_metrics
UNION ALL
SELECT 'Pagos', 'Pendientes', pending::numeric FROM payment_metrics
UNION ALL
SELECT 'Pagos', 'Pagados', paid::numeric FROM payment_metrics
UNION ALL
SELECT 'Pagos', 'Fallidos', failed::numeric FROM payment_metrics
UNION ALL
SELECT 'Pagos', 'Rechazados', rejected::numeric FROM payment_metrics
UNION ALL
SELECT 'Pagos', 'Reembolsados', refunded::numeric FROM payment_metrics
UNION ALL
SELECT 'Pagos', 'Recaudo histórico', revenue_all_time FROM payment_metrics
UNION ALL
SELECT 'Pagos', 'Recaudo este mes', revenue_this_month FROM payment_metrics
UNION ALL
SELECT 'Promociones', 'Registradas', total::numeric FROM promotion_metrics
UNION ALL
SELECT 'Promociones', 'Pendientes', pending::numeric FROM promotion_metrics
UNION ALL
SELECT 'Promociones', 'Activas pagadas', active_paid::numeric FROM promotion_metrics
UNION ALL
SELECT 'Promociones', 'Pagadas este mes', paid_this_month::numeric FROM promotion_metrics
UNION ALL
SELECT 'Promociones', 'Recaudo histórico', revenue_all_time FROM promotion_metrics
UNION ALL
SELECT 'Promociones', 'Recaudo este mes', revenue_this_month FROM promotion_metrics
UNION ALL
SELECT 'Cambios de plan', 'Solicitudes', total::numeric FROM plan_change_metrics
UNION ALL
SELECT 'Cambios de plan', 'Esperando pago', awaiting_payment::numeric FROM plan_change_metrics
UNION ALL
SELECT 'Cambios de plan', 'En revisión', pending_review::numeric FROM plan_change_metrics
UNION ALL
SELECT 'Cambios de plan', 'Programados', scheduled::numeric FROM plan_change_metrics
UNION ALL
SELECT 'Notificaciones', 'Total', total::numeric FROM notification_metrics
UNION ALL
SELECT 'Notificaciones', 'Sin leer', unread::numeric FROM notification_metrics
UNION ALL
SELECT 'Notificaciones', 'Sin resolver', unresolved::numeric FROM notification_metrics
UNION ALL
SELECT 'Planes', 'Periodos activos', active_periods::numeric FROM plan_catalog_metrics
UNION ALL
SELECT 'Planes', 'Características activas', active_features::numeric FROM plan_catalog_metrics
UNION ALL
SELECT 'Domiciliarios', 'Solicitudes', applications::numeric FROM courier_metrics
UNION ALL
SELECT 'Domiciliarios', 'Solicitudes pendientes', pending_applications::numeric FROM courier_metrics
UNION ALL
SELECT 'Domiciliarios', 'Recargas', topups::numeric FROM courier_metrics
UNION ALL
SELECT 'Domiciliarios', 'Recargas pendientes', pending_topups::numeric FROM courier_metrics
UNION ALL
SELECT 'Ingresos plataforma', 'Recaudo histórico total', revenue_all_time FROM platform_revenue_metrics
UNION ALL
SELECT 'Ingresos plataforma', 'Recaudo total este mes', revenue_this_month FROM platform_revenue_metrics
ORDER BY grupo, indicador;
