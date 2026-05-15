"""WMS 피킹 생산성 Streamlit 대시보드"""
import sys
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from sqlalchemy import create_engine, text

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from config.settings import DB_URL

st.set_page_config(
    page_title="WMS 피킹 생산성 대시보드",
    layout="wide",
)

st.title("WMS 피킹 생산성 대시보드")

# ── DB 로드 ──────────────────────────────────────
@st.cache_resource
def _engine():
    return create_engine(DB_URL, pool_pre_ping=True)


@st.cache_data(ttl=30)
def _load_all() -> pd.DataFrame:
    engine = _engine()
    sql = """
        SELECT *,
            DATE(작업일시) AS 작업일,
            EXTRACT(HOUR FROM 작업일시)::INTEGER AS 작업시간대,
            CASE WHEN zone IN ('A','B','C','D','H','I','P') THEN '일룸' ELSE '퍼시스' END AS 화주사
        FROM picking_detail
        WHERE 작업일시 IS NOT NULL
    """
    try:
        with engine.connect() as conn:
            df = pd.read_sql(text(sql), conn)
    except Exception:
        return pd.DataFrame()
    if df.empty:
        return df
    df["작업일시"] = pd.to_datetime(df["작업일시"])
    df["작업일"] = pd.to_datetime(df["작업일"]).dt.date
    df["is_wave_start"] = df["is_wave_start"].astype(bool)
    df["is_wave_end"]   = df["is_wave_end"].astype(bool)
    return df


raw = _load_all()

if raw.empty:
    st.warning("DB에 데이터가 없습니다. main.py를 먼저 실행해주세요.")
    st.stop()

# ── 사이드바 필터 ────────────────────────────────
with st.sidebar:
    st.header("필터")

    dates_all = sorted(raw["작업일"].unique())
    sel_dates = st.multiselect("날짜", dates_all, default=dates_all)

    st.selectbox("센터", ["양지1센터"], disabled=True, help="현재 양지1센터 단독 운영")

    owners_all = sorted(raw["화주사"].unique())
    sel_owners = st.multiselect("화주사", owners_all, default=owners_all)

    shifts_all = sorted(raw["shift_type"].dropna().unique())
    sel_shifts = st.multiselect("주/야간", shifts_all, default=shifts_all)

    workers_all = sorted(raw["작업자"].unique())
    sel_workers = st.multiselect("작업자", workers_all, default=workers_all)

    st.divider()
    if st.button("데이터 새로고침", use_container_width=True):
        st.cache_data.clear()
        st.rerun()

# ── 필터 적용 ────────────────────────────────────
df = raw.copy()
if sel_dates:
    df = df[df["작업일"].isin(sel_dates)]
if sel_owners:
    df = df[df["화주사"].isin(sel_owners)]
if sel_shifts:
    df = df[df["shift_type"].isin(sel_shifts)]
if sel_workers:
    df = df[df["작업자"].isin(sel_workers)]

if df.empty:
    st.warning("필터 조건에 해당하는 데이터가 없습니다.")
    st.stop()

# ── KPI 카드 ─────────────────────────────────────
total_std  = df["예상작업시간_min"].sum()
total_work = df["wave별_작업시간_min"].sum()   # wave_end 행에만 값 존재
total_eff  = total_std / total_work if total_work > 0 else 0

c1, c2, c3, c4 = st.columns(4)
c1.metric("전체 피킹 가동률", f"{total_eff:.1%}")
c2.metric("총 피킹 품목수",   f"{len(df):,} 건")
c3.metric("총 표준시간",       f"{total_std / 60:.1f} h")
c4.metric("총 실적시간",       f"{total_work / 60:.1f} h")

st.divider()

# ── 차트 1행: 작업자별 가동률 / wave별 표준 vs 실적 ──
left, right = st.columns(2)

with left:
    st.subheader("작업자별 피킹 가동률")
    wa = (
        df.groupby("작업자", as_index=False)
        .agg(
            표준시간=("예상작업시간_min",   "sum"),
            실적시간=("wave별_작업시간_min", "sum"),
            품목수  =("ITEM_ID",             "count"),
        )
    )
    wa["가동률"] = (
        wa["표준시간"] / wa["실적시간"].replace(0, float("nan"))
    ).fillna(0)
    wa = wa.sort_values("가동률")

    fig_w = px.bar(
        wa, x="가동률", y="작업자", orientation="h",
        text=wa["가동률"].map("{:.1%}".format),
        color="가동률",
        color_continuous_scale=["#d62728", "#ff7f0e", "#2ca02c"],
        range_color=[0.5, 1.1],
        hover_data={"품목수": True, "표준시간": ":.1f", "실적시간": ":.1f"},
    )
    fig_w.update_traces(textposition="outside")
    fig_w.add_vline(x=1.0, line_dash="dash", line_color="gray",
                    annotation_text="100%", annotation_position="top right")
    fig_w.update_layout(
        height=max(320, len(wa) * 28),
        coloraxis_showscale=False,
        margin=dict(l=0, r=50, t=10, b=0),
    )
    st.plotly_chart(fig_w, use_container_width=True)

with right:
    st.subheader("WAVE별 표준시간 vs 실적시간 (상위 20)")
    wv = (
        df[df["is_wave_end"]]
        .groupby(["작업자", "WAVE명"], as_index=False)
        .agg(
            표준시간=("wave별_표준시간_min", "max"),
            실적시간=("wave별_작업시간_min", "max"),
        )
        .nlargest(20, "표준시간")
    )
    wv["label"] = wv["작업자"].str[:3] + " / " + wv["WAVE명"].str[-8:]

    fig_wv = go.Figure()
    fig_wv.add_bar(name="표준시간", x=wv["label"], y=wv["표준시간"],
                   marker_color="#1f77b4")
    fig_wv.add_bar(name="실적시간", x=wv["label"], y=wv["실적시간"],
                   marker_color="#ff7f0e", opacity=0.75)
    fig_wv.update_layout(
        barmode="overlay",
        height=420,
        xaxis_tickangle=-40,
        legend=dict(orientation="h", yanchor="bottom", y=1.0),
        margin=dict(l=0, r=0, t=30, b=100),
        yaxis_title="분(min)",
    )
    st.plotly_chart(fig_wv, use_container_width=True)

# ── 차트 2행: 시간대별 피킹량 / 일별 추이 ───────────
left2, right2 = st.columns(2)

with left2:
    st.subheader("시간대별 피킹량")
    hourly = (
        df.groupby(["작업시간대", "화주사"], as_index=False)
        .agg(피킹건수=("ITEM_ID", "count"))
        .sort_values("작업시간대")
    )
    fig_h = px.line(
        hourly, x="작업시간대", y="피킹건수", color="화주사",
        markers=True, line_shape="spline",
    )
    fig_h.update_layout(
        height=350,
        xaxis=dict(tickmode="linear", tick0=0, dtick=2, title="시간대"),
        yaxis_title="피킹건수",
        legend_title="화주사",
        margin=dict(l=0, r=0, t=10, b=0),
    )
    st.plotly_chart(fig_h, use_container_width=True)

with right2:
    st.subheader("일별 피킹 가동률 추이")
    daily = (
        df.groupby("작업일", as_index=False)
        .agg(
            표준시간=("예상작업시간_min",   "sum"),
            실적시간=("wave별_작업시간_min", "sum"),
            품목수  =("ITEM_ID",             "count"),
        )
    )
    daily["가동률"] = (
        daily["표준시간"] / daily["실적시간"].replace(0, float("nan"))
    ).fillna(0)
    daily["작업일"] = daily["작업일"].astype(str)

    fig_d = go.Figure()
    fig_d.add_trace(go.Bar(
        x=daily["작업일"], y=daily["품목수"],
        name="품목수", yaxis="y2",
        marker_color="lightsteelblue", opacity=0.5,
    ))
    fig_d.add_trace(go.Scatter(
        x=daily["작업일"], y=daily["가동률"],
        name="가동률",
        mode="lines+markers+text",
        text=daily["가동률"].map("{:.1%}".format),
        textposition="top center",
        line=dict(color="#2ca02c", width=2),
    ))
    fig_d.add_hline(y=1.0, line_dash="dash", line_color="gray",
                    annotation_text="목표 100%")
    fig_d.update_layout(
        height=350,
        yaxis=dict(title="가동률", tickformat=".0%", range=[0, 1.5]),
        yaxis2=dict(title="품목수", overlaying="y", side="right"),
        legend=dict(orientation="h", yanchor="bottom", y=1.0),
        margin=dict(l=0, r=0, t=30, b=0),
    )
    st.plotly_chart(fig_d, use_container_width=True)

# ── 하단: 상세 데이터 테이블 ─────────────────────
with st.expander("상세 데이터 보기"):
    show_cols = [
        "작업자", "화주사", "shift_type", "작업일",
        "WAVE명", "PLT_ID", "LOCATION",
        "예상작업시간_min", "wave별_작업시간_min", "wave별_가동률",
    ]
    show = df[[c for c in show_cols if c in df.columns]].rename(
        columns={"shift_type": "주야간", "wave별_작업시간_min": "실적시간_min"}
    )
    st.dataframe(show, use_container_width=True, height=320)
