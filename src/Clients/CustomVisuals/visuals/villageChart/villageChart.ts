/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Jonathon Simister
 *  All rights reserved. 
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in 
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

/// <reference path="../../_references.ts" />

module powerbi.visuals {
    import SelectionManager = utility.SelectionManager;
    import ValueFormatter = powerbi.visuals.valueFormatter;

    export class VillagePerson {
        private _color: IColorInfo;
        private _category: number;
        private _silhouette: number;

        constructor(color: IColorInfo, category: number, silhouette: number) {
            this._color = color;
            this._category = category;
            this._silhouette = silhouette;
        }

        public color(): IColorInfo {
            return this._color;
        }

        public silhouette(): number {
            return this._silhouette;
        }

        public category(): number {
            return this._category;
        }

        public x: number;
        public y: number;
    }

    export class VillageData {
        public people: VillagePerson[];
        public legend: LegendData;
        public categories: string[];
        public measureName: string;
        public measures: string[];
    }

    export interface VillageSettings {
        genders: boolean;
        shuffle: boolean;
        population: number;
    }

    export class VillageChart implements IVisual {
        private svg: D3.Selection;
        private colors: IDataColorPalette;
        private legend: ILegend;
        private dataView: DataView;
        private settings: VillageSettings;
        private selectionManager: SelectionManager;
        private hostService: IVisualHostServices;

        public init(options: VisualInitOptions): void {
            this.hostService = options.host;
            this.selectionManager = new SelectionManager({ hostServices: this.hostService });

            var baseElement: D3.Selection = d3.select(options.element.get(0));

            this.svg = baseElement.append("svg");

            this.colors = options.style.colorPalette.dataColors;

            this.legend = createLegend(options.element, false, null, false);
        }

        public update(options: VisualUpdateOptions): void {
            this.svg.attr('width', options.viewport.width);
            this.svg.attr('height', options.viewport.height);

            this.svg.selectAll("*").remove();

            this.settings = this.parseSettings(options.dataViews[0]);

            var numberOfPeople: number = Math.round(this.settings.population);
            if (numberOfPeople < 1 || numberOfPeople > 1000) {
                return;
            }

            this.dataView = options.dataViews[0];
            var village: VillageData = this.converter(this.dataView, this.colors, numberOfPeople);

            this.legend.changeOrientation(LegendPosition.Top);
            this.legend.drawLegend(village.legend, options.viewport);

            var legendOffset: number = this.legend.getMargins().height;
            var viewHeight: number = options.viewport.height; // - legendOffset;

            var rectWidths: number[] = VillageChart.divisors(numberOfPeople);

            var bestFill: number = -1;
            var bestWidth: number;
            var bestScale: number;

            if (VillageChart.primes.indexOf(numberOfPeople) == -1) {
                for (var i: number = 0; i < rectWidths.length; i++) {
                    var rectWidth: number = rectWidths[i];
                    var rectHeight: number = numberOfPeople / rectWidth;

                    var scale: number = options.viewport.width / (rectWidth * 40);

                    if ((rectHeight * 110 * scale) < options.viewport.height) {
                        var testArea: number = scale * (rectWidth * 40) * (rectHeight * 110);

                        var p: number = testArea / (options.viewport.width * viewHeight);

                        if (p < 1 && p >= 0.8 && p > bestFill) {
                            bestFill = p;
                            bestWidth = rectWidth;
                            bestScale = scale;
                        }
                    }
                }
            }

            var plotWidth: number;
            var plotHeight: number;
            var plotScale: number;

            if (bestFill != -1) {
                plotWidth = bestWidth;
                plotHeight = numberOfPeople / plotWidth;
                plotScale = bestScale;
            } else {
                var personArea: number = (options.viewport.width * viewHeight) / numberOfPeople;
                var personHeight: number = Math.sqrt(personArea / (40 / 110));


                plotHeight = Math.floor(viewHeight / personHeight);
                plotWidth = Math.ceil(numberOfPeople / plotHeight);
                plotScale = options.viewport.width / (40 * plotWidth);
            }

            var stepWidth: number = (options.viewport.width / plotWidth);
            var stepHeight: number = 1.1 * (stepWidth / 0.4);

            var plot: D3.Selection = this.svg.append("g"); //.attr("transform", "translate(0, " + legendOffset.toString() + ")");

            var i: number = 0;
            for (var y: number = 0; y < plotHeight; y++) {
                for (var x: number = 0; x < plotWidth; x++) {
                    if (i == village.people.length) {
                        break;
                    }

                    village.people[i].x = (2.5 * plotScale) + (x * stepWidth);
                    village.people[i].y = (5 * plotScale) + (y * stepHeight);
                    i++;
                }
            }

            var selection: D3.UpdateSelection = plot.selectAll(".person").data(village.people);

            var person: D3.Selection = selection.enter().append("g").classed("person", true).attr("transform", (d: VillagePerson) => {
                return "translate(" + d.x.toString() + ", " + d.y.toString() + ") scale(" + plotScale.toString() + ")";
            });

            person.append("ellipse").classed("head", true).style("fill", (d: VillagePerson) => {
                return d.color().value;
            }).attr("cx", 18.616354).attr("cy", 7.5532413).attr("rx", 6.9148936).attr("ry", 7.4468584);

            person.append("path").classed("body", true).style("fill", (d: VillagePerson) => {
                return d.color().value;
            }).attr("d", (d: VillagePerson) => {
                return VillageChart.bodies[d.silhouette()]
            });

            TooltipManager.addTooltip(person, (e: TooltipEvent): TooltipDataItem[] => {
                var data: VillagePerson = e.data;

                var items: TooltipDataItem[] = [
                    {
                        header: village.categories[data.category()],
                        displayName: village.measureName,
                        value: village.measures[data.category()]
                    }
                ];

                return items;
            });

            selection.exit();
        }

        private parseSettings(dataView: DataView): VillageSettings {
            var settings: VillageSettings = VillageChart.DefaultVillageSettings;

            if (dataView) {
                var objects: DataViewObjects = dataView.metadata.objects;

                if (objects) {
                    var general = objects['general'];

                    if (general) {
                        settings.genders = <boolean>general['genders'];
                        settings.shuffle = <boolean>general['shuffle'];
                        settings.population = <number>general['population'];
                    }
                }
            }

            return settings;
        }

        private static nextSeededRandom(seed: number) {
            var r: number = Math.sin(seed) * 10000;
            return r - Math.floor(r);
        }

        public converter(dataView: DataView, colors: IDataColorPalette, clamp: number): VillageData {
            if (!dataView ||
                !dataView.categorical ||
                dataView.categorical.values.length != 1 ||
                !dataView.categorical ||
                !dataView.categorical.categories ||
                dataView.categorical.categories.length != 1) {
                return { people: [], legend: null, categories: [], measureName: "", measures: [] }
            }

            var sum: number = dataView.categorical.values[0].values.reduce((v, u) => u + v);
            var seed: number = VillageChart.nextSeededRandom(sum);
            var totals = [];
            var clampedSum: number = 0;

            for (var i: number = 0; i < dataView.categorical.values[0].values.length; i++) {
                var clampCount: number = Math.round((dataView.categorical.values[0].values[i] / sum) * clamp);

                totals.push({
                    category: i,
                    count: clampCount
                });

                clampedSum += clampCount;
            }

            totals.sort((u, v) => {
                if (u.count < v.count) {
                    return 1;
                }
                if (v.count > u.count) {
                    return -1;
                }
                return 0;
            });

            var d: number;
            var i: number;
            if (clampedSum < clamp) {
                d = 1;
                i = 0;
            } else if (clampedSum > clamp) {
                d = -1;
                i = totals.length - 1;
            }

            while (clampedSum != clamp) {
                totals[i].count += d;
                i += d;
                clampedSum += d;
            }

            var people: VillagePerson[] = new Array<VillagePerson>();

            for (var x: number = 0; x < totals.length; x++) {
                for (var y: number = 0; y < totals[x].count; y++) {
                    var bodyType: number = 0;

                    if (this.settings.genders) {
                        seed = VillageChart.nextSeededRandom(seed);
                        if (seed > 0.5) {
                            bodyType = 1;
                        }
                    }

                    people.push(new VillagePerson(colors.getColorByIndex(totals[x].category), totals[x].category, bodyType));
                }
            }

            var legendPoints = [];

            for (var i: number = 0; i < dataView.categorical.categories[0].values.length; i++) {
                legendPoints.push({
                    label: dataView.categorical.categories[0].values[i].toString(),
                    color: colors.getColorByIndex(i).value,
                    icon: LegendIcon.Box,
                    selected: false,
                    identity: SelectionId.createWithMeasure(i.toString())
                });
            }

            var legendData: LegendData = {
                title: dataView.categorical.categories[0].source.displayName,
                dataPoints: legendPoints
            };

            if (this.settings.shuffle) {
                people = VillageChart.shuffle(people);
            }

            var categories: string[] = new Array<string>(dataView.categorical.categories[0].values.length);
            for (var i: number = 0; i < categories.length; i++) {
                categories[i] = dataView.categorical.categories[0].values[i];
            }

            var measureName: string = dataView.categorical.values[0].source.displayName;

            var measureFormatter: IValueFormatter = ValueFormatter.create({
                format: dataView.categorical.values[0].source.format
            });

            var measures: string[] = new Array<string>(dataView.categorical.values[0].values.length);
            for (var i: number = 0; i < measures.length; i++) {
                measures[i] = measureFormatter.format(dataView.categorical.values[0].values[i]);
            }

            return { people: people, legend: legendData, categories: categories, measureName: measureName, measures: measures };
        }

        private static heads = [
            { cx: 18.616354, cy: 7.5532413, rx: 6.9148936, ry: 7.4468584 },
            { cx: 18.616354, cy: 7.5532413, rx: 6.9148936, ry: 7.4468584 }
        ]

        private static bodies: string[] = [
            "m 0.10675269,16.484485 0,41.851844 0.16796873,0.177735 C 2.975746,63.745619 6.2017399,59.833362 7.8528462,58.351953 l 0,-14.152438 0.015625,14.138767 c -0.00418,0.0037 -0.011421,0.0099 -0.015625,0.01367 l 0,41.541295 8.9179688,0 0,-37.025639 1.892578,0 1.798829,0 0,37.025639 8.917968,0 0,-41.295199 c -0.06451,-0.08875 0.07043,-0.141851 0.0055,-0.235717 l -0.0055,-14.162817 0,14.398534 c 3.091008,4.252201 5.721613,2.695195 7.746094,-0.26172 l 0,-41.851844 -14.087891,0 -8.84375,0 z",
            "m 0.10675269,16.484485 0,41.851844 0.16796873,0.177735 C 2.975746,63.745619 6.2017399,59.833362 7.8528462,58.351953 l 0,-14.152438 0.015625,14.138767 c -0.00418,0.0037 -0.011421,0.0099 -0.015625,0.01367 L 0.10284613,83.125 l 7.75000007,0 0,16.768247 8.9179688,0 0,-16.893247 c 1.230475,0.01234 2.460924,0.0051 3.691407,0 l 0,16.893247 8.917968,0 0,-16.86381 7.954951,0.08839 -7.954951,-24.519778 c -0.06451,-0.08875 0.07043,-0.141851 0.0055,-0.235717 l -0.0055,-14.162817 0,14.398534 c 3.091008,4.252201 5.721613,2.695195 7.746094,-0.26172 l 0,-41.851844 -14.087891,0 -8.84375,0 z"
        ];

        public static capabilities: VisualCapabilities = {
            dataRoles: [{
                name: 'Category',
                kind: powerbi.VisualDataRoleKind.Grouping,
                displayName: data.createDisplayNameGetter("Role_DisplayName_Category")
            },
                {
                    name: 'Y',
                    kind: powerbi.VisualDataRoleKind.Measure,
                    displayName: data.createDisplayNameGetter("Role_DisplayName_Value")
                }],
            dataViewMappings: [{
                conditions: [
                    { "Category": { max: 1 }, "Y": { max: 1 } },
                ],
                categorical: {
                    categories: {
                        for: { in: "Category" },
                        dataReductionAlgorithm: { top: {} }
                    },
                    values: {
                        select: [{ bind: { to: "Y" } }]
                    },
                }
            }],
            objects: {
                general: {
                    displayName: "General",
                    properties: {
                        genders: {
                            type: { bool: true },
                            displayName: "Genders"
                        },
                        shuffle: {
                            type: { bool: true },
                            displayName: "Shuffle"
                        },
                        population: {
                            type: { numeric: true },
                            displayName: "Population"
                        }
                    }
                }
            }
        };

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] {
            var instances: VisualObjectInstance[] = [];

            if (!this.dataView || !this.settings) {
                return instances;
            }

            switch (options.objectName) {
                case 'general':
                    var general: VisualObjectInstance = {
                        objectName: 'general',
                        displayName: 'General',
                        selector: null,
                        properties: {
                            genders: this.settings.genders,
                            shuffle: this.settings.shuffle,
                            population: this.settings.population
                        }
                    };

                    instances.push(general);
                    break;
            }

            return instances;
        }

        private setSelection(columns: D3.UpdateSelection, selectSecondSeries: boolean = false): void {
            var selectionIds: SelectionId[] = this.selectionManager.getSelectionIds();

            console.log(selectionIds);
        }

        private static DefaultVillageSettings: VillageSettings = {
            genders: false,
            shuffle: false,
            population: 100
        };

        private static shuffle<T>(a: Array<T>): Array<T> {
            var r: Array<T> = new Array<T>(a.length);
            for (var i: number = 0; i < r.length; i++) { r[i] = a[i]; }

            for (var i: number = 0; i < r.length - 2; i++) {
                var j: number = Math.random() * (r.length - i);
                var temp: T = r[j];
                r[j] = r[i];
                r[i] = temp;
            }

            return r;
        }

        private static primes: number[] = VillageChart.computePrimes();

        private static computePrimes(): number[] {
            var erato: boolean[] = new Array<boolean>(10000);
            var primes: number[] = new Array<number>();

            for (var i: number = 0; i < erato.length; i++) { erato[i] = true; }

            for (var x: number = 2; x < erato.length; x++) {
                if (erato[x]) {
                    primes.push(x);
                    for (var y: number = x * x; y < erato.length; y += x) {
                        erato[y] = false;
                    }
                }
            }

            return primes;
        }

        private static factorize(n: number): number[] {
            var primeFactors: number[] = new Array<number>();

            var c: number = n;
            var i: number = 0;
            while (c > 1) {
                if ((c % VillageChart.primes[i]) == 0) {
                    primeFactors.push(VillageChart.primes[i]);
                    c = c / VillageChart.primes[i];
                } else {
                    i++;
                }
            }

            return primeFactors;
        }

        private static divisors(n: number): number[] {
            var divisors: number[] = new Array<number>();
            var factors: number[] = VillageChart.factorize(n);

            var all: number = Math.pow(2, factors.length) - 1;
            for (var b: number = 1; b < all; b++) {
                var p: number = 1;

                for (var i: number = 0; i < factors.length; i++) {
                    var m: number = 1 << i;

                    if ((m & b) == m) {
                        p *= factors[i];
                    }
                }

                divisors.push(p);
            }

            return divisors;
        }
    }
}