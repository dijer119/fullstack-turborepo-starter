/**
 * 점검 시간 게이트
 *
 * index.html 과 maintenance_index.html 이 같은 설정을 사용합니다.
 * 점검 시간만 바꿀 때는 아래 CONFIG 만 수정하면 됩니다.
 */
(function (global) {
  var CONFIG = {
    // 점검 게이트 사용 여부. false 이면 항상 앱(index.html)으로 동작합니다.
    enabled: true,

    // 점검 제목
    title: '시스템 점검 안내',

    // 점검 안내 메시지 (HTML 가능)
    message: '유진증권 시스템 작업으로 인해<br>아래 시간 동안 서비스 이용이 제한됩니다.',

    // 점검 내용 (카드에 표시)
    reason: '정기 시스템 점검',

    // 화면에 보여줄 점검 일자. 빈 문자열이면 오늘 날짜를 자동 표시합니다.
    date: '2026년 9월 12일 (토)',

    // 특정 날짜에만 점검을 적용하려면 year/month/day 를 숫자로 넣습니다.
    // 모두 0 이면 매일 아래 시각에 점검 화면이 뜹니다.
    year: 2026,
    month: 9,
    day: 12,

    // 점검 시간 (로컬 시간)
    startHour: 8,
    startMinute: 30,
    endHour: 15,
    endMinute: 0,

    // 페이지 경로
    appUrl: 'index.html',
    maintenanceUrl: 'maintenance_index.html',
  };

  /// 시·분을 하루 기준 분 단위로 바꿉니다.
  function toMinutes(hour, minute) {
    return hour * 60 + minute;
  }

  /// 점검 구간이 자정을 넘기는지 확인합니다. (예: 23:50 ~ 00:30)
  function crossesMidnight() {
    return toMinutes(CONFIG.endHour, CONFIG.endMinute) <=
      toMinutes(CONFIG.startHour, CONFIG.startMinute);
  }

  /// 특정 일자 제한이 걸려 있는지 확인합니다.
  function hasSpecificDate() {
    return CONFIG.year > 0 && CONFIG.month > 0 && CONFIG.day > 0;
  }

  /// 지정한 점검 시작일과 같은 날인지 확인합니다.
  function isSameCalendarDate(now) {
    return now.getFullYear() === CONFIG.year &&
      now.getMonth() + 1 === CONFIG.month &&
      now.getDate() === CONFIG.day;
  }

  /// 지정한 점검 시작일의 다음 날인지 확인합니다. (자정 넘김용)
  function isNextCalendarDate(now) {
    var next = new Date(CONFIG.year, CONFIG.month - 1, CONFIG.day);
    next.setDate(next.getDate() + 1);
    return now.getFullYear() === next.getFullYear() &&
      now.getMonth() === next.getMonth() &&
      now.getDate() === next.getDate();
  }

  /// 현재 시각이 점검 시작·종료 시각 사이에 있는지 확인합니다.
  function isInTimeWindow(now) {
    var current = toMinutes(now.getHours(), now.getMinutes());
    var start = toMinutes(CONFIG.startHour, CONFIG.startMinute);
    var end = toMinutes(CONFIG.endHour, CONFIG.endMinute);

    // 같은 날 범위 (예: 20:20 ~ 21:00)
    if (start < end) {
      return current >= start && current < end;
    }

    // 자정을 넘는 범위 (예: 23:50 ~ 00:30)
    return current >= start || current < end;
  }

  /// 특정 날짜 설정이 있을 때 오늘이 허용된 날인지 확인합니다.
  function isOnAllowedDate(now) {
    if (!hasSpecificDate()) {
      return true;
    }

    if (isSameCalendarDate(now)) {
      return true;
    }

    // 자정 넘김: 지정일 다음날이고 아직 종료 시각 이전이면 점검 중으로 봅니다.
    if (crossesMidnight() && isNextCalendarDate(now)) {
      var current = toMinutes(now.getHours(), now.getMinutes());
      var end = toMinutes(CONFIG.endHour, CONFIG.endMinute);
      return current < end;
    }

    return false;
  }

  /// 지금이 점검 시간인지 판단합니다.
  function isMaintenanceNow() {
    if (!CONFIG.enabled) {
      return false;
    }

    var now = new Date();
    if (!isOnAllowedDate(now)) {
      return false;
    }

    return isInTimeWindow(now);
  }

  /// 다음 점검 시작까지 남은 밀리초를 계산합니다.
  /// 점검이 없거나 이미 시작된 경우 null 을 반환합니다.
  function msUntilStart() {
    if (!CONFIG.enabled) {
      return null;
    }

    var now = new Date();
    var start;

    if (hasSpecificDate()) {
      start = new Date(
        CONFIG.year,
        CONFIG.month - 1,
        CONFIG.day,
        CONFIG.startHour,
        CONFIG.startMinute,
        0
      );
    } else {
      start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        CONFIG.startHour,
        CONFIG.startMinute,
        0
      );

      // 오늘의 시작 시각이 지났으면 내일로 미룹니다.
      if (start.getTime() <= now.getTime()) {
        start.setDate(start.getDate() + 1);
      }
    }

    var diff = start.getTime() - now.getTime();
    return diff > 0 ? diff : null;
  }

  /// 점검 종료 시각을 계산합니다. 카운트다운에 사용합니다.
  function getEndTime() {
    var now = new Date();
    var end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      CONFIG.endHour,
      CONFIG.endMinute,
      0
    );

    // 자정을 넘는 경우: 시작 시각 이후라면 종료는 다음날입니다.
    if (crossesMidnight()) {
      var nowMinutes = toMinutes(now.getHours(), now.getMinutes());
      var startMinutes = toMinutes(CONFIG.startHour, CONFIG.startMinute);
      if (nowMinutes >= startMinutes) {
        end.setDate(end.getDate() + 1);
      }
    }

    return end;
  }

  global.MaintenanceGate = {
    CONFIG: CONFIG,
    isMaintenanceNow: isMaintenanceNow,
    msUntilStart: msUntilStart,
    getEndTime: getEndTime,
  };
})(window);
