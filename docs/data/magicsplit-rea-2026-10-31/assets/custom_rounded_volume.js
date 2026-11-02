/**
 * MagicSplit 둥근 거래량 막대 렌더러
 *
 * Lightweight Charts의 투명한 히스토그램 시리즈에 프리미티브를 부착하여
 * Figma와 같은 위쪽 둥근 모서리의 거래량 막대를 캔버스에 그립니다.
 */
(function () {
  'use strict';

  /** 거래량 데이터와 차트 참조를 관리하는 프리미티브입니다. */
  function RoundedVolumePrimitive() {
    this._data = [];
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._minimumBarHeight = 0;
  }

  /** 프리미티브가 시리즈에 연결될 때 차트 참조를 저장합니다. */
  RoundedVolumePrimitive.prototype.attached = function (params) {
    this._chart = params.chart;
    this._series = params.series;
    this._requestUpdate = function () { params.requestUpdate(); };
  };

  /** 프리미티브가 분리될 때 브라우저 참조를 정리합니다. */
  RoundedVolumePrimitive.prototype.detached = function () {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  };

  /** Dart에서 전달받은 거래량 목록을 저장하고 다시 그리기를 요청합니다. */
  RoundedVolumePrimitive.prototype.setData = function (data, minimumBarHeight) {
    try {
      this._data = Array.from(data);
      this._minimumBarHeight = Number.isFinite(minimumBarHeight)
        ? Math.max(0, minimumBarHeight)
        : 0;
    } catch (error) {
      this._data = [];
      this._minimumBarHeight = 0;
      console.warn('[MagicSplitRoundedVolume] 거래량 변환 실패', error);
    }

    if (this._requestUpdate) this._requestUpdate();
  };

  /** Lightweight Charts가 사용할 거래량 그리기 뷰를 반환합니다. */
  RoundedVolumePrimitive.prototype.paneViews = function () {
    return [new RoundedVolumePaneView(this)];
  };

  /** 거래량 프리미티브의 캔버스 렌더러를 제공합니다. */
  function RoundedVolumePaneView(primitive) {
    this._primitive = primitive;
  }

  /** 같은 패널에서 캔들·이평이 가려지지 않도록 거래량 막대는 뒤에 그립니다. */
  RoundedVolumePaneView.prototype.zOrder = function () {
    return 'bottom';
  };

  /** 실제 거래량 막대를 그릴 렌더러를 반환합니다. */
  RoundedVolumePaneView.prototype.renderer = function () {
    return new RoundedVolumeRenderer(this._primitive);
  };

  /** 화면에 보이는 거래량을 Figma 규격의 막대로 그립니다. */
  function RoundedVolumeRenderer(primitive) {
    this._primitive = primitive;
  }

  /** 차트의 시간·가격 좌표를 캔버스 좌표로 변환하여 막대를 그립니다. */
  RoundedVolumeRenderer.prototype.draw = function (target) {
    var primitive = this._primitive;
    if (!primitive._chart || !primitive._series || !primitive._data.length) return;

    target.useMediaCoordinateSpace(function (scope) {
      var context = scope.context;
      var timeScale = primitive._chart.timeScale();
      var bottom = primitive._series.priceToCoordinate(0);
      if (bottom === null || bottom === undefined) bottom = scope.mediaSize.height;

      // 줌 레벨(봉 사이 픽셀 간격)은 시간축이 직접 알고 있으므로 이웃 막대에서 역산하지 않습니다.
      // 역산 방식은 화면에 막대가 하나만 남으면 비교 대상이 없어 폭이 고정되는 문제가 있었습니다.
      var barSpacing = timeScale.options().barSpacing;
      if (!Number.isFinite(barSpacing) || barSpacing <= 0) barSpacing = 11;

      // 캔들 몸통과 같은 비율(약 80%)로 두께를 맞춰 확대·축소에 함께 반응하게 합니다.
      var width = Math.max(1, Math.floor(barSpacing * 0.8));

      var points = [];
      for (var i = 0; i < primitive._data.length; i++) {
        var item = primitive._data[i];
        var x = timeScale.timeToCoordinate(item.time);
        var top = primitive._series.priceToCoordinate(item.value);
        if (x === null || x === undefined || top === null || top === undefined) continue;
        if (x < -20 || x > scope.mediaSize.width + 20) continue;
        points.push({ x: x, top: top, value: item.value, color: item.color });
      }

      for (var pointIndex = 0; pointIndex < points.length; pointIndex++) {
        var point = points[pointIndex];
        var left = point.x - width / 2;
        var rawHeight = Math.max(0, bottom - point.top);
        // 0보다 큰 거래량은 최소 높이를 보장하여 작은 값도 화면에서 확인할 수 있게 합니다.
        var height = point.value > 0
          ? Math.max(primitive._minimumBarHeight, rawHeight)
          : 0;
        if (height <= 0) continue;
        var top = bottom - height;

        context.fillStyle = point.color || '#3F76EB';
        // 반지름을 폭의 절반으로 두어 확대·축소와 무관하게 위쪽이 항상 반원 돔이 됩니다.
        // 고정값을 쓰면 막대가 넓어졌을 때 곡률이 상대적으로 작아져 각져 보입니다.
        drawRoundedTopBar(context, left, top, width, height, width / 2);
      }
    });
  };

  /** 위쪽 두 모서리만 둥근 사각형 경로를 만들고 채웁니다. */
  function drawRoundedTopBar(context, x, y, width, height, radius) {
    var appliedRadius = Math.min(radius, width / 2, height);
    var right = x + width;
    var bottom = y + height;

    context.beginPath();
    context.moveTo(x, bottom);
    context.lineTo(x, y + appliedRadius);
    context.quadraticCurveTo(x, y, x + appliedRadius, y);
    context.lineTo(right - appliedRadius, y);
    context.quadraticCurveTo(right, y, right, y + appliedRadius);
    context.lineTo(right, bottom);
    context.closePath();
    context.fill();
  }

  /** Dart에서 사용할 전역 생성 함수를 공개합니다. */
  window.MagicSplitRoundedVolume = {
    create: function (series) {
      var primitive = new RoundedVolumePrimitive();
      series.attachPrimitive(primitive);

      return {
        setData: function (data, minimumBarHeight) {
          primitive.setData(data, minimumBarHeight);
        },
        destroy: function () {
          series.detachPrimitive(primitive);
        },
      };
    },
  };
})();
