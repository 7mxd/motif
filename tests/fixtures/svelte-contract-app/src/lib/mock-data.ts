// Adawat's data, in memory: a fictional tool library's shelves. Nothing is fetched.

/** A text the app shows in both its languages. */
export interface Words {
	en: string;
	ar: string;
}

/** On the shelf, out with a neighbour, or in the workshop being fixed. */
export type ToolStatus = 'in' | 'out' | 'repair';

export interface Tool {
	id: string;
	name: Words;
	kind: Words;
	/** The longest loan, in days. */
	loanDays: number;
	/** Paid when you collect it and given back when you return it, in Kuwaiti dinars. */
	deposit: number;
	/** Kilograms, case included. */
	weight: number;
	shelf: string;
	includes: Words;
	care: Words;
	status: ToolStatus;
	/** When a tool that's out is due back. */
	dueBack?: Date;
}

/** "lending" most weekends; "repair" on the first weekend of the month, which has its own look (DESIGN.md, Variants). */
export const libraryWeekend: 'lending' | 'repair' = 'lending';

/** How many tools one member can have out at a time. */
export const loanLimit = 3;

export const VOLUNTEERS = 'mailto:volunteers@adawat.example';

export const tools: Tool[] = [
	{
		id: 'cordless-drill',
		name: { en: 'Cordless drill', ar: 'مثقاب لاسلكي' },
		kind: { en: 'Power tools', ar: 'عدد كهربائية' },
		loanDays: 7,
		deposit: 10,
		weight: 1.6,
		shelf: 'B2',
		includes: { en: 'Two batteries, a charger and a case of 12 bits', ar: 'بطاريتان وشاحن وعلبة فيها ١٢ لقمة' },
		care: { en: 'Charge both batteries before you bring it back.', ar: 'اشحن البطاريتين قبل أن تعيده.' },
		status: 'in'
	},
	{
		id: 'step-ladder',
		name: { en: 'Step ladder, six steps', ar: 'سلّم بست درجات' },
		kind: { en: 'Ladders', ar: 'سلالم' },
		loanDays: 3,
		deposit: 5,
		weight: 7.5,
		shelf: 'D1',
		includes: { en: 'A tool tray that clips to the top step', ar: 'صينية أدوات تُثبّت على الدرجة العليا' },
		care: { en: 'Fold it flat and check the locks before you carry it.', ar: 'اطوِه وتأكد من الأقفال قبل أن تحمله.' },
		status: 'out',
		dueBack: new Date(2026, 10, 2)
	},
	{
		id: 'pressure-washer',
		name: { en: 'Pressure washer', ar: 'غسّالة بالضغط' },
		kind: { en: 'Cleaning', ar: 'تنظيف' },
		loanDays: 3,
		deposit: 20,
		weight: 9,
		shelf: 'C4',
		includes: { en: 'A 10 m hose, two nozzles and a patio brush', ar: 'خرطوم بطول ١٠ م وفوهتان وفرشاة للأرضيات' },
		care: { en: 'Run clean water through it and empty the hose.', ar: 'مرّر فيه ماءً نظيفًا وأفرغ الخرطوم.' },
		status: 'in'
	},
	{
		id: 'sewing-machine',
		name: { en: 'Sewing machine', ar: 'ماكينة خياطة' },
		kind: { en: 'Crafts', ar: 'حِرف' },
		loanDays: 14,
		deposit: 15,
		weight: 6.2,
		shelf: 'A3',
		includes: { en: 'A foot pedal, spare needles and four bobbins', ar: 'دوّاسة وإبر احتياطية وأربع بكرات' },
		care: { en: 'Leave the needle up and cover it again.', ar: 'اترك الإبرة مرفوعة وأعد الغطاء عليها.' },
		status: 'repair'
	},
	{
		id: 'tile-cutter',
		name: { en: 'Tile cutter', ar: 'قطّاعة بلاط' },
		kind: { en: 'Building', ar: 'بناء' },
		loanDays: 7,
		deposit: 10,
		weight: 5.4,
		shelf: 'C1',
		includes: { en: 'A spare scoring wheel and a pair of tile nippers', ar: 'عجلة قطع احتياطية وكمّاشة بلاط' },
		care: { en: 'Brush off the dust and lock the handle down.', ar: 'انفض الغبار وثبّت المقبض في مكانه.' },
		status: 'in'
	},
	{
		id: 'hedge-trimmer',
		name: { en: 'Hedge trimmer', ar: 'مقصّ تشذيب' },
		kind: { en: 'Garden', ar: 'حديقة' },
		loanDays: 3,
		deposit: 10,
		weight: 3.1,
		shelf: 'D3',
		includes: { en: 'A blade guard and a 15 m extension lead', ar: 'غطاء للشفرة وسلك تمديد بطول ١٥ م' },
		care: { en: 'Wipe the blade and put its guard back on.', ar: 'امسح الشفرة وأعد غطاءها.' },
		status: 'out',
		dueBack: new Date(2026, 9, 31)
	}
];

export const findTool = (id: string): Tool | undefined => tools.find((t) => t.id === id);
