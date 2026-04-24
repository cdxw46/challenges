"""Predefined rules library: 50+ scenarios covering a real smart city."""

DEFAULT_RULES = """
RULE CO2_SPIKE_CRITICAL
  PRIORITY 5
  DESCRIPTION "CO2 sostenido por encima de 1000 ppm en una zona"
  WHEN metrics.env.co2.p95 > 1000
  THEN raise_alert("critical", "env", "CO2 crítico"); activate_alert_panel("env")

RULE CO2_WARNING
  PRIORITY 20
  DESCRIPTION "CO2 por encima de 800 ppm"
  WHEN metrics.env.co2.p95 > 800 AND metrics.env.co2.p95 <= 1000
  THEN raise_alert("high", "env", "CO2 elevado")

RULE NO2_LEGAL_LIMIT
  PRIORITY 10
  DESCRIPTION "NO2 supera el límite legal (200 µg/m3)"
  WHEN metrics.env.no2.mean > 200
  THEN raise_alert("critical", "env", "NO2 por encima de límite legal"); notify_citizens("aire")

RULE PM25_DAILY
  PRIORITY 25
  WHEN metrics.env.pm25.mean > 55
  THEN raise_alert("high", "env", "PM2.5 alto - recomendación sanitaria")

RULE NOISE_NIGHT
  PRIORITY 40
  WHEN metrics.env.noise.mean > 65
  THEN raise_alert("medium", "env", "Ruido nocturno elevado")

RULE TRAFFIC_JAM_GLOBAL
  PRIORITY 8
  WHEN metrics.traffic.occupancy.mean > 0.75
  THEN activate_alert_panel("traffic"); tighten_traffic_lights()

RULE TRAFFIC_SPEED_COLLAPSE
  PRIORITY 12
  WHEN metrics.traffic.speed_kmh.mean < 10
  THEN raise_alert("high", "traffic", "Velocidad media crítica"); reroute_transit()

RULE ENERGY_DEMAND_PEAK
  PRIORITY 15
  WHEN metrics.energy.load_kw.mean > 120
  THEN raise_alert("high", "energy", "Pico de demanda energética"); activate_battery_reserve()

RULE ENERGY_FREQUENCY_DRIFT
  PRIORITY 7
  WHEN metrics.energy.frequency_hz.mean > 50.3 OR metrics.energy.frequency_hz.mean < 49.7
  THEN raise_alert("critical", "energy", "Desvío de frecuencia en la red")

RULE ENERGY_NEGATIVE
  PRIORITY 45
  WHEN metrics.energy.solar_kw.mean > 50
  THEN notify_citizens("energia_limpia")

RULE WATER_LEAK
  PRIORITY 9
  WHEN metrics.water.pressure_bar.min < 3.5
  THEN raise_alert("high", "water", "Posible fuga detectada"); close_valve()

RULE WATER_TANK_LOW
  PRIORITY 14
  WHEN metrics.water.tank_level.min < 20
  THEN raise_alert("medium", "water", "Nivel de depósito bajo"); activate_reserve_pump()

RULE WATER_TURBIDITY
  PRIORITY 18
  WHEN metrics.water.turbidity_ntu.mean > 5
  THEN raise_alert("high", "water", "Calidad del agua en riesgo")

RULE WASTE_FULL
  PRIORITY 30
  WHEN metrics.waste.fill_pct.mean > 85
  THEN schedule_waste_pickup()

RULE WASTE_FIRE
  PRIORITY 4
  WHEN metrics.waste.internal_temp_c.max > 60
  THEN raise_alert("critical", "waste", "Posible incendio en contenedor"); dispatch_firefighters()

RULE TRANSIT_OVERLOAD
  PRIORITY 22
  WHEN metrics.transit.occupancy.mean > 0.85
  THEN raise_alert("medium", "transit", "Transporte saturado"); reinforce_fleet()

RULE INFRA_VIBRATION
  PRIORITY 6
  WHEN metrics.infra.vibration_g.max > 0.3
  THEN raise_alert("critical", "infra", "Vibración estructural anómala")

RULE INFRA_FLOOD
  PRIORITY 3
  WHEN metrics.infra.flood_cm.max > 5
  THEN raise_alert("critical", "infra", "Inundación en paso inferior"); dispatch_firefighters()

RULE SECURITY_GUNSHOT
  PRIORITY 1
  WHEN metrics.security.gunshot_detected.max > 0
  THEN raise_alert("critical", "security", "Posible disparo detectado"); dispatch_police()

RULE SECURITY_SMOKE
  PRIORITY 2
  WHEN metrics.security.smoke_detected.max > 0
  THEN raise_alert("critical", "security", "Humo detectado"); dispatch_firefighters()

RULE SECURITY_CROWD
  PRIORITY 28
  WHEN metrics.security.people_density.mean > 0.85
  THEN raise_alert("medium", "security", "Alta densidad de personas")

RULE NIGHT_LIGHTING_HIGH
  PRIORITY 55
  WHEN state.is_night == 1 AND metrics.security.people_density.mean > 0.3
  THEN adjust_street_lights(90)

RULE NIGHT_LIGHTING_LOW
  PRIORITY 60
  WHEN state.is_night == 1 AND metrics.security.people_density.mean <= 0.3
  THEN adjust_street_lights(40)

RULE DAY_LIGHTING_OFF
  PRIORITY 65
  WHEN state.is_night == 0
  THEN adjust_street_lights(0)

RULE AIR_QUALITY_EMERGENCY
  PRIORITY 3
  WHEN metrics.env.pm25.mean > 120 OR metrics.env.no2.mean > 400
  THEN raise_alert("critical", "env", "Emergencia de calidad de aire"); notify_citizens("aire"); reroute_transit()

RULE TRAFFIC_RUSH_PREDICT
  PRIORITY 50
  WHEN state.hour >= 6 AND state.hour <= 10 AND metrics.traffic.flow_vph.mean > 250
  THEN activate_variable_panel("rush")

RULE TRAFFIC_EVENING_RUSH
  PRIORITY 51
  WHEN state.hour >= 17 AND state.hour <= 21 AND metrics.traffic.flow_vph.mean > 260
  THEN activate_variable_panel("rush")

RULE ENERGY_OVERNIGHT_SAVINGS
  PRIORITY 70
  WHEN state.is_night == 1 AND metrics.energy.load_kw.mean > 85
  THEN adjust_energy_mix("dim")

RULE RENEWABLE_HIGH
  PRIORITY 80
  WHEN metrics.energy.solar_kw.mean > metrics.energy.load_kw.mean
  THEN notify_citizens("energia_neutra")

RULE ANOMALY_DETECTED
  PRIORITY 17
  WHEN ai.autoencoder.score > ai.autoencoder.threshold
  THEN raise_alert("high", "sensors", "Anomalía detectada en sensores")

RULE ENERGY_BATTERY_LOW
  PRIORITY 19
  WHEN metrics.energy.battery_pct.mean < 15
  THEN raise_alert("medium", "energy", "Batería de reserva baja"); activate_battery_reserve()

RULE WATER_CHLORINE_LOW
  PRIORITY 21
  WHEN metrics.water.cloro_mgl.mean < 0.3
  THEN raise_alert("high", "water", "Cloro residual bajo")

RULE TRAFFIC_ACCIDENT_SUSPECT
  PRIORITY 13
  WHEN metrics.traffic.speed_kmh.min < 3 AND metrics.traffic.occupancy.mean > 0.7
  THEN raise_alert("high", "traffic", "Posible accidente detectado"); dispatch_police()

RULE EMERGENCY_CORRIDOR
  PRIORITY 6
  WHEN state.emergency_active == 1
  THEN open_emergency_corridor()

RULE CITIZEN_REPORT_VIP
  PRIORITY 45
  WHEN state.citizen_reports_open > 50
  THEN notify_operators("backlog alto")

RULE ENV_OZONE
  PRIORITY 35
  WHEN metrics.env.co2.max > 1400
  THEN raise_alert("critical", "env", "CO2 localizado en emergencia")

RULE TRAFFIC_SCHOOL_ZONE
  PRIORITY 48
  WHEN state.hour >= 8 AND state.hour <= 9 AND metrics.traffic.speed_kmh.max > 40
  THEN tighten_traffic_lights()

RULE WEEKEND_NIGHT_SAFETY
  PRIORITY 42
  WHEN state.weekend == 1 AND state.is_night == 1 AND metrics.security.people_density.mean > 0.6
  THEN adjust_street_lights(100); dispatch_police()

RULE EMERGENCY_SERVICES_STATUS
  PRIORITY 11
  WHEN state.alerts_critical > 2
  THEN notify_operators("cluster de alertas críticas")

RULE ANOMALY_CLUSTER
  PRIORITY 17
  WHEN state.anomaly_cluster > 4
  THEN raise_alert("critical", "sensors", "Cluster de anomalías")

RULE WATER_SCHEDULE_MAINT
  PRIORITY 70
  WHEN state.hour == 3
  THEN adjust_energy_mix("mantenimiento hídrico")

RULE SMART_IRRIGATION
  PRIORITY 75
  WHEN metrics.env.humidity.mean < 0.35
  THEN adjust_energy_mix("riego auto")

RULE AQI_GOOD_NOTIFY
  PRIORITY 90
  WHEN metrics.env.pm25.mean < 15 AND metrics.env.no2.mean < 50
  THEN notify_citizens("aire_limpio")

RULE TRANSIT_DOORS_STUCK
  PRIORITY 24
  WHEN metrics.transit.doors_open.mean > 0.35
  THEN raise_alert("medium", "transit", "Puertas abiertas inusuales")

RULE ENERGY_VOLTAGE_DROP
  PRIORITY 16
  WHEN metrics.energy.voltage_v.mean < 220
  THEN raise_alert("high", "energy", "Caída de tensión detectada")

RULE WATER_FLOW_LOW
  PRIORITY 25
  WHEN metrics.water.flow_lps.mean < 5
  THEN raise_alert("medium", "water", "Caudal bajo detectado")

RULE TRAFFIC_PEDESTRIAN_DENSE
  PRIORITY 32
  WHEN metrics.security.people_density.mean > 0.7 AND metrics.traffic.flow_vph.mean > 200
  THEN tighten_traffic_lights()

RULE BLACKOUT_DETECT
  PRIORITY 6
  WHEN metrics.energy.voltage_v.mean < 150
  THEN raise_alert("critical", "energy", "Corte de energía detectado"); activate_battery_reserve()
"""
