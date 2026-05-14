import pandas as pd
from datetime import datetime, time
from config.settings import STANDARD_TIME


def calculate(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["standard_time_sec"] = _calc_standard_time(df)
    df["actual_time_sec"] = _calc_actual_time(df)
    df["efficiency_rate"] = (
        df["standard_time_sec"] / df["actual_time_sec"].replace(0, pd.NA) * 100
    ).round(1)
    df["lines_per_hour"] = (
        df["pick_lines"] / (df["actual_time_sec"] / 3600).replace(0, pd.NA)
    ).round(1)
    return df


def _calc_standard_time(df: pd.DataFrame) -> pd.Series:
    st = STANDARD_TIME
    result = pd.Series(0.0, index=df.index)
    if "pick_lines" in df.columns:
        result += df["pick_lines"].fillna(0) * st["pick_per_line"]
    if "travel_distance" in df.columns:
        result += df["travel_distance"].fillna(0) * st["travel_per_meter"]
    return result


def _calc_actual_time(df: pd.DataFrame) -> pd.Series:
    if "work_start" not in df.columns or "work_end" not in df.columns:
        return pd.Series(pd.NA, index=df.index)

    def to_seconds(row):
        try:
            start = datetime.combine(datetime.today(), row["work_start"])
            end = datetime.combine(datetime.today(), row["work_end"])
            delta = (end - start).total_seconds()
            return delta if delta > 0 else pd.NA
        except Exception:
            return pd.NA

    return df.apply(to_seconds, axis=1)
