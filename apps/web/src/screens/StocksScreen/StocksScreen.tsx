import React, { useState, KeyboardEvent, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  TextField,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Chip,
  CircularProgress,
  Alert,
  InputAdornment,
  IconButton,
  Tabs,
  Tab,
  Stack,
  Input,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import {
  useGetStocksQuery,
  useLazySearchStocksQuery,
  useGetStockCountQuery,
  useGetAllTagsQuery,
  useToggleStockExcludeMutation,
  useToggleStockFavoriteMutation,
  useAddTagToStockMutation,
  useRemoveTagFromStockMutation,
  Stock,
} from '../../store/services/stock-api';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';

type Order = 'asc' | 'desc';
type OrderBy = 'stockValue' | 'dividendYield' | 'name' | 'close' | 'chagesRatio' | 'marcap';

const StocksScreen: React.FC = () => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [marketFilter, setMarketFilter] = useState<string | undefined>(undefined);
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [onlyFavorite, setOnlyFavorite] = useState(false);
  const [filterRoe, setFilterRoe] = useState(true); // ROE > 0 default on
  const [minDividendYield, setMinDividendYield] = useState<number | undefined>(undefined);
  const [dividendYieldInput, setDividendYieldInput] = useState('');
  const [order, setOrder] = useState<Order>('desc');
  const [orderBy, setOrderBy] = useState<OrderBy>('stockValue');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInputs, setTagInputs] = useState<{ [key: number]: string }>({});
  const [showTagInput, setShowTagInput] = useState<{ [key: number]: boolean }>({});

  // API 쿼리 - 서버사이드 정렬 파라미터 추가
  const { data: stocksData, isLoading, error, refetch } = useGetStocksQuery({
    skip: page * rowsPerPage,
    take: rowsPerPage,
    market: marketFilter,
    includeExcluded,
    sortBy: orderBy,
    sortOrder: order,
    onlyFavorite,
    minRoe: filterRoe ? 0 : undefined,
    minDividendYield,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
  });

  const [toggleExclude] = useToggleStockExcludeMutation();
  const [toggleFavorite] = useToggleStockFavoriteMutation();
  const [addTag] = useAddTagToStockMutation();
  const [removeTag] = useRemoveTagFromStockMutation();

  const { data: totalCount } = useGetStockCountQuery(marketFilter);
  const { data: allTags = [] } = useGetAllTagsQuery();
  const [triggerSearch, { data: searchResults, isLoading: isSearching }] = useLazySearchStocksQuery();

  // 엔터키로 재조회 기능
  useEffect(() => {
    const handleKeyPress = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // 로딩 중이면 무시
      if (isSearching || isLoading) {
        return;
      }

      // INPUT/TEXTAREA이지만 검색창이 비어있으면 재조회 허용
      const isInputOrTextarea = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      const hasSearchKeyword = searchKeyword.trim() !== '';

      if (isInputOrTextarea && hasSearchKeyword) {
        return; // 검색어가 있는 상태에서 INPUT 입력 중이면 무시
      }

      // 엔터키 감지 - 검색창이 비어있거나 다른 요소에서 발생
      if (e.key === 'Enter') {
        e.preventDefault();
        refetch();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isSearching, isLoading, refetch, searchKeyword]);

  // 검색 핸들러
  const handleSearch = () => {
    if (searchKeyword.trim()) {
      triggerSearch({ keyword: searchKeyword, limit: 20 });
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // 페이지네이션 핸들러
  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // 시장 필터 변경
  const handleMarketChange = (_event: React.SyntheticEvent, newValue: number) => {
    const markets = [undefined, 'KOSPI', 'KOSDAQ'];
    setMarketFilter(markets[newValue]);
    setPage(0);
  };

  // 종목 제외 토글
  const handleToggleExclude = async (id: number) => {
    try {
      await toggleExclude(id).unwrap();
      // 검색 결과가 있는 경우 검색을 다시 실행
      if (searchResults && searchKeyword.trim()) {
        triggerSearch({ keyword: searchKeyword, limit: 20 });
      }
    } catch (error) {
      console.error('Failed to toggle exclude:', error);
    }
  };

  // 종목 좋아요 토글
  const handleToggleFavorite = async (id: number) => {
    try {
      await toggleFavorite(id).unwrap();
      // 검색 결과가 있는 경우 검색을 다시 실행
      if (searchResults && searchKeyword.trim()) {
        triggerSearch({ keyword: searchKeyword, limit: 20 });
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  // 정렬 핸들러
  const handleRequestSort = (property: OrderBy) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  // 태그 관련 핸들러
  const handleAddTag = async (stockId: number, tag: string) => {
    if (!tag.trim()) return;

    try {
      await addTag({ id: stockId, tag: tag.trim() }).unwrap();
      setTagInputs({ ...tagInputs, [stockId]: '' });
      setShowTagInput({ ...showTagInput, [stockId]: false });
      // 검색 결과가 있는 경우 검색을 다시 실행
      if (searchResults && searchKeyword.trim()) {
        triggerSearch({ keyword: searchKeyword, limit: 20 });
      }
    } catch (error) {
      console.error('Failed to add tag:', error);
    }
  };

  const handleRemoveTag = async (stockId: number, tag: string) => {
    try {
      await removeTag({ id: stockId, tag }).unwrap();
      // 검색 결과가 있는 경우 검색을 다시 실행
      if (searchResults && searchKeyword.trim()) {
        triggerSearch({ keyword: searchKeyword, limit: 20 });
      }
    } catch (error) {
      console.error('Failed to remove tag:', error);
    }
  };

  const handleTagInputKeyPress = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, stockId: number) => {
    if (event.key === 'Enter') {
      handleAddTag(stockId, tagInputs[stockId] || '');
    } else if (event.key === 'Escape') {
      setShowTagInput({ ...showTagInput, [stockId]: false });
      setTagInputs({ ...tagInputs, [stockId]: '' });
    }
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
    setPage(0);
  };

  // 숫자 포맷팅
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ko-KR').format(num);
  };

  const formatCurrency = (num: number): string => {
    return `₩${formatNumber(num)}`;
  };

  // 시가총액을 억 단위로 포맷팅
  const formatMarketCap = (num: number): string => {
    const billion = Math.round(num / 100000000); // 1억으로 나누고 반올림
    return `${formatNumber(billion)}억`;
  };

  // 표시할 데이터 결정 (검색 결과 or 목록)
  // 서버사이드 정렬을 사용하므로 클라이언트에서 정렬하지 않음
  const displayStocks = searchResults || stocksData?.stocks || [];
  const displayTotal = searchResults ? searchResults.length : (totalCount || 0);

  const marketIndex = marketFilter === 'KOSPI' ? 1 : marketFilter === 'KOSDAQ' ? 2 : 0;

  return (
    <Container maxWidth={false} sx={{ py: 4, px: 2 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
          주식 종목 조회
        </Typography>
        <Typography variant="body1" color="text.secondary">
          KOSPI와 KOSDAQ에 상장된 전체 종목을 조회할 수 있습니다.
        </Typography>
      </Box>

      {/* 검색 바 */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="종목명 또는 종목코드로 검색 (예: 삼성전자, 005930)"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          onKeyPress={handleSearchKeyPress}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: isSearching && (
              <InputAdornment position="end">
                <CircularProgress size={20} />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      {/* 필터 컨트롤 */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={onlyFavorite}
                onChange={(e) => {
                  setOnlyFavorite(e.target.checked);
                  setPage(0);
                }}
              />
            }
            label="좋아요 종목만"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={filterRoe}
                onChange={(e) => {
                  setFilterRoe(e.target.checked);
                  setPage(0);
                }}
              />
            }
            label="ROE > 0"
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">배당수익률 최소:</Typography>
            <TextField
              size="small"
              type="number"
              value={dividendYieldInput}
              onChange={(e) => setDividendYieldInput(e.target.value)}
              onBlur={() => {
                const value = parseFloat(dividendYieldInput);
                if (!isNaN(value) && value >= 0) {
                  setMinDividendYield(value);
                  setPage(0);
                } else if (dividendYieldInput === '') {
                  setMinDividendYield(undefined);
                  setPage(0);
                }
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  const value = parseFloat(dividendYieldInput);
                  if (!isNaN(value) && value >= 0) {
                    setMinDividendYield(value);
                    setPage(0);
                  } else if (dividendYieldInput === '') {
                    setMinDividendYield(undefined);
                    setPage(0);
                  }
                }
              }}
              sx={{ width: 100 }}
              placeholder="0"
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>,
              }}
            />
          </Box>
        </Box>
      </Paper>

      {/* 태그 필터 */}
      {allTags.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="body2" gutterBottom>태그 필터:</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {allTags.map(tag => (
              <Chip
                key={tag}
                label={tag}
                onClick={() => toggleTagFilter(tag)}
                color={selectedTags.includes(tag) ? "primary" : "default"}
                variant={selectedTags.includes(tag) ? "filled" : "outlined"}
                size="small"
              />
            ))}
          </Stack>
        </Paper>
      )}

      {/* 시장 필터 탭 및 옵션 */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Tabs value={marketIndex} onChange={handleMarketChange}>
          <Tab label={`전체 (${totalCount || 0})`} />
          <Tab label="KOSPI" />
          <Tab label="KOSDAQ" />
        </Tabs>
        <FormControlLabel
          control={
            <Checkbox
              checked={includeExcluded}
              onChange={(e) => setIncludeExcluded(e.target.checked)}
            />
          }
          label="제외된 종목 포함"
        />
      </Box>

      {/* 에러 표시 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          데이터를 불러오는 중 오류가 발생했습니다.
        </Alert>
      )}

      {/* 로딩 표시 */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* 주식 테이블 */}
      {!isLoading && displayStocks.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={{ width: '60px' }}>좋아요</TableCell>
                <TableCell align="center" sx={{ width: '60px' }}>제외</TableCell>
                <TableCell sx={{ width: '100px' }}>종목코드</TableCell>
                <TableCell sx={{ minWidth: '150px' }}>
                  <TableSortLabel
                    active={orderBy === 'name'}
                    direction={orderBy === 'name' ? order : 'asc'}
                    onClick={() => handleRequestSort('name')}
                  >
                    종목명
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'close'}
                    direction={orderBy === 'close' ? order : 'asc'}
                    onClick={() => handleRequestSort('close')}
                  >
                    현재가
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'marcap'}
                    direction={orderBy === 'marcap' ? order : 'asc'}
                    onClick={() => handleRequestSort('marcap')}
                  >
                    시가총액
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">EPS</TableCell>
                <TableCell align="right">BPS</TableCell>
                <TableCell align="right">10년가치</TableCell>
                <TableCell align="right">10년승수</TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'stockValue'}
                    direction={orderBy === 'stockValue' ? order : 'asc'}
                    onClick={() => handleRequestSort('stockValue')}
                  >
                    주식가치
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">ROE</TableCell>
                <TableCell align="right">PER</TableCell>
                <TableCell align="right">PBR</TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'dividendYield'}
                    direction={orderBy === 'dividendYield' ? order : 'asc'}
                    onClick={() => handleRequestSort('dividendYield')}
                  >
                    배당수익률
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ minWidth: '200px' }}>태그</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayStocks.map((stock: Stock) => (
                <TableRow
                  key={stock.id}
                  hover
                  sx={{ '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <TableCell align="center">
                    <Checkbox
                      checked={stock.favorite}
                      onChange={() => handleToggleFavorite(stock.id)}
                      onClick={(e) => e.stopPropagation()}
                      color="primary"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Checkbox
                      checked={stock.exclude}
                      onChange={() => handleToggleExclude(stock.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`https://finance.naver.com/item/main.naver?code=${stock.code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      underline="hover"
                      sx={{ fontFamily: 'monospace' }}
                    >
                      {stock.code}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {stock.name}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="medium">
                      {formatCurrency(stock.close)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{formatMarketCap(stock.marcap)}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {stock.eps ? formatCurrency(stock.eps) : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {stock.bps ? formatCurrency(stock.bps) : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {stock.tenYearValue ? formatCurrency(Math.round(stock.tenYearValue)) : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {stock.tenYearMultiple ? Math.round(stock.tenYearMultiple) : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {stock.stockValue ? `${stock.stockValue.toFixed(2)}%` : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {stock.roe ? `${stock.roe.toFixed(2)}%` : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {stock.per ? stock.per.toFixed(2) : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {stock.pbr ? stock.pbr.toFixed(2) : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {stock.dividendYield ? `${stock.dividendYield.toFixed(2)}%` : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                      {stock.tags?.map((tag) => (
                        <Chip
                          key={tag}
                          label={tag}
                          size="small"
                          onDelete={() => handleRemoveTag(stock.id, tag)}
                          deleteIcon={<CloseIcon />}
                        />
                      ))}
                      {showTagInput[stock.id] ? (
                        <Input
                          size="small"
                          value={tagInputs[stock.id] || ''}
                          onChange={(e) => setTagInputs({ ...tagInputs, [stock.id]: e.target.value })}
                          onKeyDown={(e) => handleTagInputKeyPress(e, stock.id)}
                          onBlur={() => {
                            if (!tagInputs[stock.id]) {
                              setShowTagInput({ ...showTagInput, [stock.id]: false });
                            }
                          }}
                          placeholder="태그 입력"
                          sx={{ width: 100 }}
                          autoFocus
                        />
                      ) : (
                        <Tooltip title="태그 추가">
                          <IconButton
                            size="small"
                            onClick={() => setShowTagInput({ ...showTagInput, [stock.id]: true })}
                          >
                            <AddIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* 페이지네이션 (검색 결과가 아닐 때만 표시) */}
          {!searchResults && (
            <TablePagination
              component="div"
              count={displayTotal}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[20, 50, 100]}
              labelRowsPerPage="페이지당 행 수:"
              labelDisplayedRows={({ from, to, count }) =>
                `${from}-${to} / 전체 ${count !== -1 ? count : `${to}개 이상`}`
              }
            />
          )}
        </TableContainer>
      )}

      {/* 데이터 없음 */}
      {!isLoading && displayStocks.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            {searchKeyword ? '검색 결과가 없습니다.' : '표시할 데이터가 없습니다.'}
          </Typography>
        </Paper>
      )}
    </Container>
  );
};

export default StocksScreen;
