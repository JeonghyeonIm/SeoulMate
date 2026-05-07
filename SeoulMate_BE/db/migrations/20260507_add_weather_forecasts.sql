create table if not exists weather_forecasts (
  id            bigserial    primary key,
  region_code   varchar(20)  not null,
  region_name   varchar(50),
  forecast_date date         not null,
  temp_min      smallint,
  temp_max      smallint,
  rain_prob_am  smallint,
  rain_prob_pm  smallint,
  weather_am    varchar(30),
  weather_pm    varchar(30),
  base_time     varchar(12)  not null,
  fetched_at    timestamp    not null default current_timestamp,
  constraint uq_weather_region_date unique (region_code, forecast_date)
);

create index if not exists idx_weather_forecast_date
  on weather_forecasts (forecast_date);
