/**
 * MagicSplit 차트 2패널(캔들/거래량) 구성 헬퍼
 *
 * Lightweight Charts v5의 패널(pane) API를 감싸서 Dart(Flutter)에서 안전하게
 * 호출할 수 있게 합니다. Dart의 js_interop으로 addSeries에 paneIndex를 직접
 * 넘기면 인자 개수 불일치로 실패하는 경우가 있어, JS 쪽에서 처리합니다.
 *
 * 제공 기능
 * - addSeriesToPane : 지정한 패널에 시리즈를 생성 (패널이 없으면 추가)
 * - applyPaneRatio  : 아래(거래량) 패널이 차지할 높이 비율을 적용
 * - getVolumeRatio  : 현재 화면에 그려진 실제 높이 비율을 계산
 * - observePaneResize : 구분선 드래그가 끝났을 때 비율 변화를 알려줌
 */
(function () {
  'use strict';

  /** 거래량 패널이 가질 수 있는 최소 높이 비율입니다. */
  var MIN_RATIO = 0.1;

  /** 거래량 패널이 가질 수 있는 최대 높이 비율입니다. */
  var MAX_RATIO = 0.5;

  /** 거래량 패널의 기본 높이 비율입니다. (캔들 7 : 거래량 3) */
  var DEFAULT_RATIO = 0.3;

  /**
   * 비율 값을 허용 범위(MIN_RATIO ~ MAX_RATIO) 안으로 보정합니다.
   *
   * @param {number} ratio - 보정할 비율
   * @returns {number} 허용 범위로 잘린 비율. 숫자가 아니면 기본값 0.3
   */
  function clampRatio(ratio) {
    // 숫자가 아니거나 NaN이면 기본 비율(30%)로 되돌립니다.
    if (!Number.isFinite(ratio)) return DEFAULT_RATIO;
    return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
  }

  /**
   * 차트에서 패널 목록을 안전하게 가져옵니다.
   *
   * 구버전 라이브러리에는 panes()가 없을 수 있으므로 예외를 흡수합니다.
   *
   * @param {object} chart - Lightweight Charts 차트 객체
   * @returns {Array} 패널 배열. 실패 시 빈 배열
   */
  function safePanes(chart) {
    try {
      if (!chart || typeof chart.panes !== 'function') return [];
      var panes = chart.panes();
      return Array.isArray(panes) ? panes : [];
    } catch (error) {
      console.warn('[MagicSplitPanes] panes() 조회 실패', error);
      return [];
    }
  }

  window.MagicSplitPanes = {
    /**
     * 지정한 인덱스의 패널에 시리즈를 생성합니다.
     *
     * ## 동작 순서
     * 1. 목표 인덱스까지 패널이 모자라면 addPane()으로 채웁니다.
     * 2. 해당 패널의 addSeries()로 시리즈를 만듭니다.
     * 3. 패널 API 사용에 실패하면 기본 패널(0번)에 생성해 차트가 죽지 않게 합니다.
     *
     * @param {object} chart - 차트 객체
     * @param {object} seriesType - LightweightCharts.HistogramSeries 등 시리즈 정의
     * @param {object} options - 시리즈 옵션
     * @param {number} paneIndex - 시리즈를 붙일 패널 인덱스(0=캔들, 1=거래량)
     * @returns {object} 생성된 시리즈 객체
     */
    addSeriesToPane: function (chart, seriesType, options, paneIndex) {
      var targetIndex = Number.isFinite(paneIndex) ? Math.max(0, Math.floor(paneIndex)) : 0;

      try {
        // 1단계: 목표 패널이 아직 없으면 필요한 개수만큼 새로 만듭니다.
        var panes = safePanes(chart);
        while (panes.length <= targetIndex && typeof chart.addPane === 'function') {
          chart.addPane();
          panes = safePanes(chart);
        }

        // 2단계: 목표 패널이 준비됐으면 그 패널에 시리즈를 붙입니다.
        var pane = panes[targetIndex];
        if (pane && typeof pane.addSeries === 'function') {
          return pane.addSeries(seriesType, options || {});
        }
      } catch (error) {
        console.warn('[MagicSplitPanes] 패널 시리즈 생성 실패, 기본 패널로 대체', error);
      }

      // 3단계: 패널 API를 못 쓰는 상황에서도 차트가 비지 않도록 기본 패널에 만듭니다.
      return chart.addSeries(seriesType, options || {});
    },

    /**
     * 아래 거래량 패널이 차지할 높이 비율을 적용합니다.
     *
     * 픽셀 단위 setHeight()는 창 크기가 바뀌면 비율이 틀어지므로,
     * 화면 크기와 무관한 stretchFactor로 비율을 지정합니다.
     *
     * @param {object} chart - 차트 객체
     * @param {number} volumeRatio - 거래량 패널 높이 비율(0.1 ~ 0.5)
     * @returns {boolean} 적용 성공 여부
     */
    applyPaneRatio: function (chart, volumeRatio) {
      try {
        var panes = safePanes(chart);
        // 패널이 2개 미만이면 비율을 나눌 대상이 없으므로 건너뜁니다.
        if (panes.length < 2) return false;

        var ratio = clampRatio(volumeRatio);
        var candlePane = panes[0];
        var volumePane = panes[1];
        if (typeof candlePane.setStretchFactor !== 'function') return false;

        // stretchFactor는 상대값이므로 합이 100이 되도록 나눠 줍니다.
        candlePane.setStretchFactor((1 - ratio) * 100);
        volumePane.setStretchFactor(ratio * 100);
        return true;
      } catch (error) {
        console.warn('[MagicSplitPanes] 패널 비율 적용 실패', error);
        return false;
      }
    },

    /**
     * 현재 화면에 그려진 실제 패널 높이로 거래량 비율을 계산합니다.
     *
     * @param {object} chart - 차트 객체
     * @returns {number} 거래량 패널 비율. 계산 불가 시 0
     */
    getVolumeRatio: function (chart) {
      try {
        var panes = safePanes(chart);
        if (panes.length < 2) return 0;

        var candleHeight = panes[0].getHeight();
        var volumeHeight = panes[1].getHeight();
        var total = candleHeight + volumeHeight;
        // 아직 레이아웃이 잡히기 전(0px)이면 비율을 계산할 수 없습니다.
        if (!Number.isFinite(total) || total <= 0) return 0;

        return volumeHeight / total;
      } catch (error) {
        console.warn('[MagicSplitPanes] 패널 비율 조회 실패', error);
        return 0;
      }
    },

    /**
     * 구분선 드래그가 끝났을 때 바뀐 비율을 콜백으로 알려줍니다.
     *
     * Lightweight Charts는 패널 리사이즈 이벤트를 제공하지 않기 때문에,
     * 차트 컨테이너의 포인터 조작이 끝나는 시점에 높이를 다시 읽습니다.
     *
     * ## 동작 순서
     * 1. 컨테이너에서 pointerup/pointercancel을 감지합니다.
     * 2. 레이아웃 반영 후(다음 프레임) 실제 비율을 다시 계산합니다.
     * 3. 이전 값과 의미 있게 달라졌을 때만 콜백을 호출합니다.
     *
     * @param {object} chart - 차트 객체
     * @param {HTMLElement} container - 차트가 들어 있는 DOM 요소
     * @param {Function} callback - 변경된 비율을 받는 콜백
     * @returns {object} 구독 해제용 { destroy } 객체
     */
    observePaneResize: function (chart, container, callback) {
      var lastRatio = this.getVolumeRatio(chart);
      var self = this;

      /** 포인터 조작이 끝난 뒤 비율 변화를 확인해 콜백을 호출합니다. */
      var handlePointerUp = function () {
        // 2단계: 드래그 결과가 레이아웃에 반영된 다음 프레임에 읽습니다.
        window.requestAnimationFrame(function () {
          var ratio = self.getVolumeRatio(chart);
          if (!Number.isFinite(ratio) || ratio <= 0) return;

          // 3단계: 1px 미만의 미세한 흔들림은 저장 낭비이므로 무시합니다.
          if (Math.abs(ratio - lastRatio) < 0.005) return;

          lastRatio = ratio;
          try {
            callback(ratio);
          } catch (error) {
            console.warn('[MagicSplitPanes] 비율 변경 콜백 실패', error);
          }
        });
      };

      // 1단계: 드래그 종료를 감지할 이벤트를 컨테이너에 연결합니다.
      container.addEventListener('pointerup', handlePointerUp);
      container.addEventListener('pointercancel', handlePointerUp);

      return {
        destroy: function () {
          container.removeEventListener('pointerup', handlePointerUp);
          container.removeEventListener('pointercancel', handlePointerUp);
        },
        /** 외부에서 비율을 바꾼 직후, 그 값을 기준값으로 다시 맞춥니다. */
        sync: function () {
          lastRatio = self.getVolumeRatio(chart);
        },
      };
    },
  };
})();
