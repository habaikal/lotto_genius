import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { RefreshCw, BarChart2, ShieldCheck, Zap, TrendingUp, Settings, Download, Share, Trash2, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';

/**
 * LOTTO GENIUS - 통계적 균형 및 비인기 조합 필터 기반 로또 번호 생성기
 */

// --- Constants & Utilities ---

const getBallStyle = (num: number) => {
    if (num <= 10) return {
        bg: 'from-amber-300 via-yellow-500 to-amber-600',
        shadow: 'shadow-amber-500/50',
        text: 'text-yellow-900 border-amber-400/50'
    };
    if (num <= 20) return {
        bg: 'from-blue-300 via-blue-500 to-blue-700',
        shadow: 'shadow-blue-500/50',
        text: 'text-white border-blue-400/50'
    };
    if (num <= 30) return {
        bg: 'from-red-300 via-red-500 to-red-700',
        shadow: 'shadow-red-500/50',
        text: 'text-white border-red-400/50'
    };
    if (num <= 40) return {
        bg: 'from-slate-300 via-slate-500 to-slate-700',
        shadow: 'shadow-slate-500/50',
        text: 'text-white border-slate-400/50'
    };
    return {
        bg: 'from-emerald-300 via-emerald-500 to-emerald-700',
        shadow: 'shadow-emerald-500/50',
        text: 'text-white border-emerald-400/50'
    };
};

// Types
type LottoDraw = number[];
type Stats = {
    avgSum: number;
    hotNumbers: number[];
};
type Game = {
    numbers: number[];
    sum: number;
    oddCount: number;
    hotCount: number;
};

// --- Components ---

const LottoBall = ({ number, animate }: { number: number, animate?: boolean }) => {
    const style = getBallStyle(number);

    return (
        <div className={`relative group ${animate ? 'animate-bounce-short' : ''} transition-transform duration-300 hover:scale-110 z-10`}>
            {/* Main Ball Body */}
            <div
                className={`
                    w-10 h-10 sm:w-12 sm:h-12 rounded-full 
                    flex items-center justify-center 
                    font-bold text-lg sm:text-xl font-mono
                    bg-gradient-to-br ${style.bg}
                    box-shadow-2xl shadow-lg ${style.shadow}
                    relative overflow-hidden
                    border border-white/20
                    ${style.text}
                `}
                style={{
                    boxShadow: 'inset -5px -5px 10px rgba(0,0,0,0.3), inset 2px 2px 5px rgba(255,255,255,0.3)',
                }}
            >
                {/* Specular Highlight (The "Shine") */}
                <div className="absolute top-1 left-2 w-4 h-2 bg-white/40 blur-sm rounded-full transform -rotate-45"></div>

                {/* Text Shadow for better contrast */}
                <span className="drop-shadow-md z-10 filter">{number}</span>
            </div>

            {/* Ground Reflection/Shadow */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-black/30 blur-md rounded-full -z-10 group-hover:scale-90 transition-transform duration-300"></div>
        </div>
    );
};

const StatCard = ({ title, value, subtext, icon: Icon, colorClass }: any) => (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-xl flex items-center space-x-4">
        <div className={`p-3 rounded-lg ${colorClass} bg-opacity-20`}>
            <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
        </div>
        <div>
            <h3 className="text-slate-400 text-xs uppercase tracking-wider">{title}</h3>
            <div className="text-2xl font-bold text-white">{value}</div>
            {subtext && <div className="text-xs text-slate-500">{subtext}</div>}
        </div>
    </div>
);

export default function LottoGenius() {
    // State
    const [historyData, setHistoryData] = useState<LottoDraw[]>([]);


    const [tolerance, setTolerance] = useState(0.05); // 5% default
    const [generatedGames, setGeneratedGames] = useState<Game[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [stats, setStats] = useState<Stats>({ avgSum: 0, hotNumbers: [] });
    const [logs, setLogs] = useState<string[]>([]);
    const [targetGameCount, setTargetGameCount] = useState<number>(5);


    // Auto-load data from Supabase on mount
    useEffect(() => {
        const fetchLottoData = async () => {
            try {
                let allData: any[] = [];
                let page = 0;
                const pageSize = 1000;
                let hasMore = true;

                while (hasMore) {
                    const { data, error } = await supabase
                        .from('lotto_draws')
                        .select('*')
                        .order('draw_no', { ascending: true })
                        .range(page * pageSize, (page + 1) * pageSize - 1);

                    if (error) throw error;

                    if (data && data.length > 0) {
                        allData = [...allData, ...data];
                        if (data.length < pageSize) {
                            hasMore = false;
                        } else {
                            page++;
                        }
                    } else {
                        hasMore = false;
                    }
                }

                if (allData.length > 0) {
                    // Map Supabase data to the format expected by the app (array of numbers)
                    // Schema: draw_no, date, num1, num2, num3, num4, num5, num6, bonus
                    const formattedData: LottoDraw[] = allData.map(record => [
                        record.num1,
                        record.num2,
                        record.num3,
                        record.num4,
                        record.num5,
                        record.num6
                    ]);

                    setHistoryData(formattedData);

                    // Find the max draw number
                    const maxDraw = allData.reduce((max, record) => Math.max(max, record.draw_no), 0);

                    console.log(`Loaded ${allData.length} records in total. Last Round: ${maxDraw}`);
                }
            } catch (err) {
                console.error("Failed to load data from Supabase:", err);
            }
        };

        fetchLottoData();
    }, []);

    // --- Statistics Calculation ---
    useEffect(() => {
        if (!historyData || historyData.length === 0) return;

        // 1. Calculate Average Sum
        let totalSum = 0;
        const frequency: Record<number, number> = {};

        historyData.forEach(draw => {
            const sum = draw.reduce((a, b) => a + b, 0);
            totalSum += sum;
            draw.forEach(num => {
                frequency[num] = (frequency[num] || 0) + 1;
            });
        });

        const avgSum = totalSum / historyData.length;

        // 2. Identify Top 10 Hot Numbers
        const sortedNums = Object.keys(frequency)
            .map(num => ({ num: parseInt(num), count: frequency[parseInt(num)] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
            .map(item => item.num);

        setStats({ avgSum, hotNumbers: sortedNums });
    }, [historyData]);





    // --- Core Algorithm ---
    const generateLottoNumbers = async () => {
        setIsGenerating(true);
        setGeneratedGames([]);
        setLogs([]);

        await new Promise(r => setTimeout(r, 500));

        const newGames: Game[] = [];
        let attempts = 0;
        const maxAttempts = 10000;

        // Default stats if no data loaded
        const currentAvgSum = stats.avgSum || 138; // 138 is theoretical avg sum of lotto (avg(1..45)=23 * 6 = 138)

        const targetMin = currentAvgSum * (1 - tolerance);
        const targetMax = currentAvgSum * (1 + tolerance);

        const addLog = (msg: string) => {
            setLogs(prev => [`[필터] ${msg}`, ...prev].slice(0, 5));
        };

        const currentHotNumbers = stats.hotNumbers.length > 0 ? stats.hotNumbers : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Fallback

        while (newGames.length < targetGameCount && attempts < maxAttempts) {
            attempts++;

            // 1. Random Generation
            const numbers = new Set<number>();
            while (numbers.size < 6) {
                numbers.add(Math.floor(Math.random() * 45) + 1);
            }
            const candidate = Array.from(numbers).sort((a, b) => a - b);

            // --- FILTER 1: Statistical Balance (Sum) ---
            const sum = candidate.reduce((a, b) => a + b, 0);
            if (sum < targetMin || sum > targetMax) {
                if (attempts % 100 === 0) addLog(`합계(${sum}) 범위 초과`);
                continue;
            }

            // --- FILTER 2: Logic Filters ---

            // 2-1. Consecutive Numbers (3+)
            let consecutiveCount = 0;
            let hasThreeConsecutive = false;
            for (let i = 0; i < candidate.length - 1; i++) {
                if (candidate[i] + 1 === candidate[i + 1]) {
                    consecutiveCount++;
                    if (consecutiveCount >= 2) hasThreeConsecutive = true;
                } else {
                    consecutiveCount = 0;
                }
            }
            if (hasThreeConsecutive) {
                if (attempts % 100 === 0) addLog(`3연속 번호 발견`);
                continue;
            }

            // 2-2. Too Many Hot Numbers
            const hotCount = candidate.filter(n => currentHotNumbers.includes(n)).length;
            if (hotCount >= 3) {
                if (attempts % 100 === 0) addLog(`인기 번호 과다(${hotCount})`);
                continue;
            }

            // 2-3. Birthday Bias
            const allBirthday = candidate.every(n => n <= 31);
            if (allBirthday) {
                if (attempts % 100 === 0) addLog(`생일 패턴(저번호) 발견`);
                continue;
            }

            // 2-4. Odd/Even Balance
            const oddCount = candidate.filter(n => n % 2 !== 0).length;
            if (oddCount === 0 || oddCount === 6 || oddCount === 1 || oddCount === 5) {
                if (attempts % 100 === 0) addLog(`홀짝 불균형(${oddCount}:${6 - oddCount})`);
                continue;
            }

            // Success
            newGames.push({ numbers: candidate, sum, oddCount, hotCount });
        }

        setGeneratedGames(newGames);
        setIsGenerating(false);
    };

    const handleSaveExcel = () => {
        if (generatedGames.length === 0) return;
        
        const wsData = generatedGames.map((game, i) => ({
            '게임': `Game ${i + 1}`,
            '번호1': game.numbers[0],
            '번호2': game.numbers[1],
            '번호3': game.numbers[2],
            '번호4': game.numbers[3],
            '번호5': game.numbers[4],
            '번호6': game.numbers[5],
            '합계': game.sum,
            '홀/짝': `${game.oddCount}:${6 - game.oddCount}`
        }));
        
        const ws = XLSX.utils.json_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Recommended Games");
        
        XLSX.writeFile(wb, `lotto_genius_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const handleSendText = async () => {
        if (generatedGames.length === 0) return;
        
        const contentForFile = generatedGames.map((game, i) =>
            `[Lotto Genius] Game ${i + 1}: ${game.numbers.join(', ')}\n합계: ${game.sum}, 홀짝: ${game.oddCount}:${6-game.oddCount}\n`
        ).join('\n');
        
        const contentForShare = generatedGames.map((game, i) =>
            `[Lotto Genius] Game ${i + 1}: ${game.numbers.join(', ')}`
        ).join('\n');

        const fallbackDownloadText = () => {
            const blob = new Blob([contentForFile], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lotto_genius_${new Date().toISOString().slice(0, 10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        };

        // Create a text file
        const blob = new Blob([contentForFile], { type: 'text/plain;charset=utf-8' });
        const file = new File([blob], `lotto_genius_${new Date().toISOString().slice(0, 10)}.txt`, { type: 'text/plain' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: 'Lotto Genius Picks',
                    text: '로또 추천 번호 파일입니다.',
                    files: [file]
                });
            } catch (err) {
                console.log('Share failed with file, falling back to download', err);
                fallbackDownloadText();
            }
        } else if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Lotto Genius Picks',
                    text: contentForShare,
                });
            } catch (err) {
                console.log('Share failed, falling back to download', err);
                fallbackDownloadText();
            }
        } else {
            fallbackDownloadText();
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-200 font-sans selection:bg-emerald-500 selection:text-white pb-20">
            {/* Header */}
            <header className="bg-slate-800/50 backdrop-blur-lg border-b border-white/5 sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <div className="bg-gradient-to-tr from-emerald-400 to-cyan-500 p-2 rounded-lg shadow-lg shadow-emerald-500/20">
                            <Zap className="w-6 h-6 text-white" fill="currentColor" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-tight">Lotto Genius <span className="text-emerald-400">AI</span> <span className="text-xs text-slate-500 font-normal ml-1">v1.2</span></h1>
                            <p className="text-xs text-slate-400">통계 기반 로또 예측 시스템</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">

                {/* Intro/Upload Section */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-purple-500 blur-3xl opacity-20 group-hover:opacity-30 transition"></div>

                        <h2 className="text-lg font-semibold text-white mb-4 flex items-center">
                            <Settings className="w-5 h-5 mr-2 text-purple-400" />
                            분석 설정
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-2">데이터베이스 상태</label>
                                <div className="px-3 py-3 bg-slate-900 border border-slate-700 rounded-lg flex justify-between items-center">
                                    <div className="flex items-center space-x-2 text-emerald-400">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                        <span className="text-sm font-semibold">최종회차</span>
                                    </div>
                                    <div className="text-lg text-white font-bold font-mono bg-slate-800 px-3 py-1 rounded border border-slate-700">
                                        {historyData.length > 0 ? historyData.length : '...'}회
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-2">예측 허용 범위 (Tolerance)</label>
                                <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                                    <button
                                        onClick={() => setTolerance(0.02)}
                                        className={`flex-1 py-1.5 text-sm rounded-md transition ${tolerance === 0.02 ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        Strict (±2%)
                                    </button>
                                    <button
                                        onClick={() => setTolerance(0.05)}
                                        className={`flex-1 py-1.5 text-sm rounded-md transition ${tolerance === 0.05 ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        Standard (±5%)
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-slate-400 mb-2">생성 게임 수 (0-50)</label>
                                <div className="flex items-center space-x-3">
                                    <input
                                        type="range"
                                        min="0"
                                        max="50"
                                        value={targetGameCount}
                                        onChange={(e) => setTargetGameCount(parseInt(e.target.value))}
                                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                    />
                                    <span className="bg-slate-900 px-3 py-1 rounded text-white font-mono min-w-[3rem] text-center border border-slate-700">{targetGameCount}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats Dashboard */}
                    <div className="grid grid-cols-1 gap-4">
                        <StatCard
                            title="평균 합계 (Avg Sum)"
                            value={stats.avgSum > 0 ? stats.avgSum.toFixed(1) : "N/A"}
                            subtext={stats.avgSum > 0 ? `Target: ${(stats.avgSum * (1 - tolerance)).toFixed(0)} ~ ${(stats.avgSum * (1 + tolerance)).toFixed(0)}` : "데이터 로드 필요"}
                            icon={TrendingUp}
                            colorClass="bg-emerald-500"
                        />
                        <StatCard
                            title="최다 빈출 (Hot Numbers)"
                            value={stats.hotNumbers.length > 0 ? stats.hotNumbers.slice(0, 5).join(', ') : "N/A"}
                            subtext="Too hot to handle? (제외 필터 적용)"
                            icon={BarChart2}
                            colorClass="bg-orange-500"
                        />
                    </div>
                </section>

                {/* Action Button */}
                <div className="flex justify-center space-x-4">
                    <button
                        onClick={generateLottoNumbers}
                        disabled={isGenerating || historyData.length === 0}
                        className={`
              relative overflow-hidden group
              px-12 py-5 rounded-full font-bold text-xl tracking-wider
              text-white shadow-[0_0_40px_-10px_rgba(16,185,129,0.5)]
              transition-all duration-300 transform hover:scale-105 active:scale-95
              ${(isGenerating || historyData.length === 0) ? 'bg-slate-700 cursor-not-allowed opacity-50' : 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400'}
            `}
                    >
                        <span className="relative z-10 flex items-center space-x-3">
                            {isGenerating ? (
                                <>
                                    <RefreshCw className="w-6 h-6 animate-spin" />
                                    <span>분석 중...</span>
                                </>
                            ) : (
                                <>
                                    <Zap className="w-6 h-6" fill="currentColor" />
                                    <span>AI 번호 생성</span>
                                </>
                            )}
                        </span>
                    </button>

                    <button
                        onClick={() => {
                            setGeneratedGames([]);
                            setLogs([]);
                        }}
                        disabled={generatedGames.length === 0}
                        className={`
                            px-6 py-5 rounded-full font-bold text-lg
                            transition-all duration-300 transform hover:scale-105 active:scale-95
                            border border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800
                            flex items-center space-x-2
                            ${generatedGames.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        <Trash2 className="w-5 h-5" />
                        <span>초기화</span>
                    </button>
                </div>

                {/* Logs Area */}
                {logs.length > 0 && (
                    <div className="bg-black/30 rounded-lg p-3 text-xs font-mono text-slate-500 overflow-hidden border border-slate-800">
                        {logs.map((log, i) => (
                            <div key={i} className="truncate">{log}</div>
                        ))}
                    </div>
                )}

                {/* Results Section */}
                {generatedGames.length > 0 && (
                    <section className="space-y-4 animate-fade-in-up">
                        <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-800/80 p-4 rounded-xl border-l-4 border-emerald-500 backdrop-blur">
                            <h3 className="text-xl font-bold text-white flex items-center space-x-2 mb-4 sm:mb-0">
                                <span>추천 조합</span>
                                <span className="text-sm font-normal text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                                    {generatedGames.length} Games
                                </span>
                            </h3>

                            <div className="flex space-x-2">
                                <button
                                    onClick={handleSaveExcel}
                                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition shadow-lg shadow-emerald-500/20"
                                >
                                    <FileSpreadsheet className="w-4 h-4" />
                                    <span>엑셀 저장</span>
                                </button>
                                <button
                                    onClick={handleSendText}
                                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition shadow-lg shadow-indigo-500/20"
                                >
                                    <FileText className="w-4 h-4" />
                                    <span>텍스트 전송</span>
                                </button>
                            </div>
                        </div>

                        <div className="grid gap-4">
                            {generatedGames.map((game, index) => (
                                <div
                                    key={index}
                                    className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-xl p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between hover:border-emerald-500/50 transition duration-300 group shadow-lg"
                                >
                                    <div className="flex items-center space-x-4 mb-4 sm:mb-0 w-full sm:w-auto justify-center">
                                        <span className="text-slate-500 font-mono text-sm mr-2">#{index + 1}</span>
                                        <div className="flex space-x-2 sm:space-x-3">
                                            {game.numbers.map((num) => (
                                                <LottoBall key={num} number={num} animate={true} />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex space-x-6 text-xs sm:text-sm text-slate-400 w-full sm:w-auto justify-between sm:justify-end px-4 sm:px-0 border-t sm:border-t-0 border-slate-700 pt-3 sm:pt-0 mt-2 sm:mt-0">
                                        <div className="flex flex-col items-center sm:items-end">
                                            <span className="text-xs text-slate-600 uppercase">Sum</span>
                                            <span className="text-emerald-400 font-bold">{game.sum}</span>
                                        </div>
                                        <div className="flex flex-col items-center sm:items-end">
                                            <span className="text-xs text-slate-600 uppercase">Odd/Even</span>
                                            <span className="text-slate-300">{game.oddCount}:{6 - game.oddCount}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Algorithm Info */}
                <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mt-8">
                    <h4 className="text-slate-300 font-semibold mb-4 flex items-center">
                        <ShieldCheck className="w-5 h-5 mr-2 text-indigo-400" />
                        시스템 적용 알고리즘
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-400">
                        <div className="flex items-start space-x-2">
                            <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-emerald-500 shrink-0"></div>
                            <p><strong>합계 필터:</strong> {stats.avgSum > 0 ? `역대 평균(${stats.avgSum.toFixed(0)})` : '평균'} 기준 ±{(tolerance * 100).toFixed(0)}% 이내</p>
                        </div>
                        <div className="flex items-start space-x-2">
                            <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-emerald-500 shrink-0"></div>
                            <p><strong>연속 번호:</strong> 3연속 번호 제외</p>
                        </div>
                        <div className="flex items-start space-x-2">
                            <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-emerald-500 shrink-0"></div>
                            <p><strong>과열 번호:</strong> 인기 번호 3개 이상 중복 제외</p>
                        </div>
                        <div className="flex items-start space-x-2">
                            <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-emerald-500 shrink-0"></div>
                            <p><strong>패턴 제거:</strong> 생일 패턴(1~31) 및 홀짝 쏠림 제외</p>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
