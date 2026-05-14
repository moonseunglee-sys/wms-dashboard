import dash
from dash import dcc, html, Input, Output, callback
import dash_bootstrap_components as dbc
import plotly.express as px
import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.db.repository import query

app = dash.Dash(__name__, external_stylesheets=[dbc.themes.BOOTSTRAP])
app.title = "WMS 피킹 생산성 대시보드"

app.layout = dbc.Container([
    dbc.Row(dbc.Col(html.H2("WMS 피킹 생산성 대시보드"), className="my-3")),
    dbc.Row([
        dbc.Col(dcc.DatePickerRange(
            id="date-range",
            display_format="YYYY-MM-DD",
        ), width=4),
        dbc.Col(dbc.Button("조회", id="btn-refresh", color="primary"), width=1),
    ], className="mb-3"),
    dbc.Row([
        dbc.Col(dbc.Card([dbc.CardBody([html.H6("평균 효율률"), html.H3(id="kpi-efficiency")])]), width=3),
        dbc.Col(dbc.Card([dbc.CardBody([html.H6("시간당 평균 라인"), html.H3(id="kpi-lph")])]), width=3),
        dbc.Col(dbc.Card([dbc.CardBody([html.H6("총 피킹 라인"), html.H3(id="kpi-total-lines")])]), width=3),
        dbc.Col(dbc.Card([dbc.CardBody([html.H6("작업자 수"), html.H3(id="kpi-workers")])]), width=3),
    ], className="mb-3"),
    dbc.Row([
        dbc.Col(dcc.Graph(id="chart-efficiency-trend"), width=8),
        dbc.Col(dcc.Graph(id="chart-worker-rank"), width=4),
    ]),
], fluid=True)


@callback(
    Output("kpi-efficiency", "children"),
    Output("kpi-lph", "children"),
    Output("kpi-total-lines", "children"),
    Output("kpi-workers", "children"),
    Output("chart-efficiency-trend", "figure"),
    Output("chart-worker-rank", "figure"),
    Input("btn-refresh", "n_clicks"),
    Input("date-range", "start_date"),
    Input("date-range", "end_date"),
)
def update_dashboard(n, start_date, end_date):
    sql = "SELECT * FROM picking_productivity WHERE 1=1"
    if start_date:
        sql += f" AND work_date >= '{start_date}'"
    if end_date:
        sql += f" AND work_date <= '{end_date}'"

    try:
        df = query(sql)
    except Exception:
        df = pd.DataFrame()

    if df.empty:
        empty_fig = px.scatter(title="데이터 없음")
        return "-", "-", "-", "-", empty_fig, empty_fig

    avg_eff = f"{df['efficiency_rate'].mean():.1f}%"
    avg_lph = f"{df['lines_per_hour'].mean():.1f}"
    total_lines = f"{int(df['pick_lines'].sum()):,}"
    workers = str(df["worker_id"].nunique())

    trend = df.groupby("work_date")["efficiency_rate"].mean().reset_index()
    fig_trend = px.line(trend, x="work_date", y="efficiency_rate", title="일자별 효율률 추이", markers=True)

    rank = df.groupby("worker_name")["lines_per_hour"].mean().sort_values(ascending=True).reset_index()
    fig_rank = px.bar(rank, x="lines_per_hour", y="worker_name", orientation="h", title="작업자별 시간당 라인")

    return avg_eff, avg_lph, total_lines, workers, fig_trend, fig_rank


if __name__ == "__main__":
    app.run(debug=True)
