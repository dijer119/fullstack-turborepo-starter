/**
 * MagicSplit 커스텀 차트 마커
 *
 * lightweight-charts v5의 커스텀 프리미티브 API를 활용하여
 * Figma 매수/매도 핀 아이콘(SVG)을 캔버스에 렌더링합니다.
 *
 * 마커:
 *   - 매수(Buy): ic_chart_marker_b.svg — 캔들 아래, 위쪽 팁이 봉을 가리킴
 *   - 매도(Sell): ic_chart_marker_s.svg — 캔들 위, 아래쪽 팁이 봉을 가리킴
 *
 * 사용법 (Dart에서):
 *   final primitive = MagicSplitMarkers.create(series);
 *   primitive.setMarkers([...]);   // 마커 업데이트
 *   primitive.destroy();           // 제거
 */
(function () {
  'use strict';

  var MARKER_WIDTH = 18;
  var MARKER_HEIGHT = 24;
  var MARKER_GAP = 2; // 캔들과 아이콘 팁 사이 간격

  var buyImage = null;
  var sellImage = null;
  var imagesReady = false;

  /**
   * Figma 마커 SVG를 미리 로드합니다.
   * 로드가 끝나면 등록된 프리미티브에 다시 그리기를 요청합니다.
   */
  function preloadMarkerImages() {
    var pending = 2;
    var buy = new Image();
    var sell = new Image();

    function onDone() {
      pending -= 1;
      if (pending > 0) return;
      buyImage = buy;
      sellImage = sell;
      imagesReady = buy.complete && sell.complete && buy.naturalWidth > 0 && sell.naturalWidth > 0;
      // 로드 완료 후 열려 있는 프리미티브 갱신
      for (var i = 0; i < activePrimitives.length; i++) {
        if (activePrimitives[i]._requestUpdate) {
          activePrimitives[i]._requestUpdate();
        }
      }
    }

    buy.onload = onDone;
    buy.onerror = onDone;
    sell.onload = onDone;
    sell.onerror = onDone;
    // Flutter Web 빌드가 생성하는 에셋 경로에서 매수·매도 SVG를 불러옵니다.
    buy.src = 'assets/assets/icons/ic_chart_marker_b.svg';
    sell.src = 'assets/assets/icons/ic_chart_marker_s.svg';
  }

  var activePrimitives = [];
  preloadMarkerImages();

  // ── 커스텀 프리미티브 본체 ──────────────────────────────
  function CustomChartMarkersPrimitive() {
    this._markers = [];
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  CustomChartMarkersPrimitive.prototype.attached = function (params) {
    this._chart = params.chart;
    this._series = params.series;
    var self = this;
    this._requestUpdate = function () { params.requestUpdate(); };
    activePrimitives.push(this);
    console.log('[MagicSplitMarkers] attached: chart=', !!this._chart, 'series=', !!this._series);
  };

  CustomChartMarkersPrimitive.prototype.detached = function () {
    console.log('[MagicSplitMarkers] detached');
    var idx = activePrimitives.indexOf(this);
    if (idx >= 0) activePrimitives.splice(idx, 1);
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  };

  CustomChartMarkersPrimitive.prototype.setMarkers = function (markers) {
    try {
      this._markers = Array.from(markers);
    } catch (e) {
      this._markers = [];
      console.warn('[MagicSplitMarkers] setMarkers: Array.from 실패', e);
    }
    console.log('[MagicSplitMarkers] setMarkers: 마커 수 =', this._markers.length);
    if (this._requestUpdate) {
      this._requestUpdate();
    }
  };

  CustomChartMarkersPrimitive.prototype.paneViews = function () {
    return [new CustomMarkersPaneView(this)];
  };

  function CustomMarkersPaneView(primitive) {
    this._primitive = primitive;
  }

  CustomMarkersPaneView.prototype.zOrder = function () {
    return 'top';
  };

  CustomMarkersPaneView.prototype.renderer = function () {
    return new CustomMarkersRenderer(this._primitive);
  };

  function CustomMarkersRenderer(primitive) {
    this._primitive = primitive;
  }

  /**
   * draw: lightweight-charts가 프레임마다 호출하는 렌더링 함수
   */
  CustomMarkersRenderer.prototype.draw = function (target) {
    var p = this._primitive;
    if (!p._chart || !p._series || !p._markers || !p._markers.length) return;
    if (!imagesReady || !buyImage || !sellImage) return;

    try {
      target.useMediaCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var timeScale = p._chart.timeScale();

        for (var i = 0; i < p._markers.length; i++) {
          var marker = p._markers[i];
          var x = timeScale.timeToCoordinate(marker.time);
          if (x === null || x === undefined) continue;

          var y = p._series.priceToCoordinate(marker.price);
          if (y === null || y === undefined) continue;

          drawMarkerIcon(ctx, x, y, marker);
        }
      });
    } catch (e) {
      console.error('[MagicSplitMarkers] draw 에러:', e);
    }
  };

  /**
   * Figma 핀 아이콘을 캔들 위/아래에 그립니다.
   *
   * belowBar(매수 B): 아이콘을 캔들 아래에 두고 위쪽 팁이 봉을 가리킴
   * aboveBar(매도 S): 아이콘을 캔들 위에 두고 아래쪽 팁이 봉을 가리킴
   */
  function drawMarkerIcon(ctx, x, y, marker) {
    // 아이콘 종류와 배치 방향을 분리해 B/S 위치를 독립적으로 제어합니다.
    var isBuy = marker.text === 'B';
    var isBelowBar = marker.position === 'belowBar';
    var img = isBuy ? buyImage : sellImage;
    if (!img) return;

    var left = x - MARKER_WIDTH / 2;
    var top;
    if (isBelowBar) {
      // 팁(위쪽)이 캔들 low 바로 아래에 오도록 배치
      top = y + MARKER_GAP;
    } else {
      // 팁(아래쪽)이 캔들 high 바로 위에 오도록 배치
      top = y - MARKER_GAP - MARKER_HEIGHT;
    }

    ctx.drawImage(img, left, top, MARKER_WIDTH, MARKER_HEIGHT);
  }

  window.MagicSplitMarkers = {
    create: function (series) {
      console.log('[MagicSplitMarkers] create 호출됨, series=', !!series);
      try {
        var primitive = new CustomChartMarkersPrimitive();
        series.attachPrimitive(primitive);
        console.log('[MagicSplitMarkers] attachPrimitive 성공');

        return {
          setMarkers: function (markers) { primitive.setMarkers(markers); },
          destroy: function () {
            try { series.detachPrimitive(primitive); } catch (e) { console.warn('[MagicSplitMarkers] detach 에러:', e); }
          }
        };
      } catch (e) {
        console.error('[MagicSplitMarkers] create 에러:', e);
        return {
          setMarkers: function () {},
          destroy: function () {}
        };
      }
    }
  };
})();
