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
    import ValueFormatter = powerbi.visuals.valueFormatter;

    export interface StreamPoint {
        x: number;
        y: number;
        y0?: number;
    }

    export interface VelocitySettings {
        pebbles: boolean
    }

    class EventPoint {
        public x: number;
        public y: number;
        public category: number;
        public magnitude: number;
        public date: Date;

        constructor(x: number, category: number, magnitude: number, date: Date) {
            this.x = x;
            this.category = category;
            this.magnitude = magnitude;
            this.date = date;

            var seed: number = x + magnitude;

            var r: number = Math.sin(seed) * 10000;
            r = r - Math.floor(r);

            this.y = r;
        }
    }

    class VelocityStreamViewModel {
        public categories: string[];
        public streamPoints: StreamPoint[][];
        public regionPoints: SVGPoint[][][];
        public eventPoints: EventPoint[];
        public magnitudeTitle: string;
        public dateTitle: string;
        public legendData: LegendData;
        public intervalTitle: string;

        public heightLegend: number = 25;
        public heightAxis: number = 20;

        public hasTitles: boolean;
        public hasMagnitudes: boolean;

        public showPebbles: boolean;
        public showScanline: boolean;

        public doAnimations: boolean;

        public chartMagnitudes: boolean;
        public sumMagnitudes: boolean;
        public magnitudeThresholds: D3.Scale.QuantileScale;
        public dateScale: D3.Scale.TimeScale;

        public streamsHeight: number;
        public streamsWidth: number;

        private freq: Array<Array<number>>;

        public magnitudeFormatter: IValueFormatter;

        constructor(options: VisualUpdateOptions, colors: IDataColorPalette, settings: VelocitySettings) {
            var data = options.dataViews[0].categorical;

            var groups = data.categories[1].values;
            var dates: Date[] = data.categories[0].values;
            var magnitudes: number[];

            this.streamsHeight = options.viewport.height - this.heightLegend - this.heightAxis;
            this.streamsWidth = options.viewport.width;

            this.dateTitle = data.categories[0].source.displayName;

            this.hasMagnitudes = !!data.values[0];

            this.showPebbles = settings.pebbles;

            this.chartMagnitudes = this.hasMagnitudes;

            this.doAnimations = !options.suppressAnimations;

            this.legendData = {
                dataPoints: [],
                title: data.categories[1].source.displayName
            };

            if (this.hasMagnitudes) {
                magnitudes = data.values[0].values;
                this.magnitudeTitle = data.values[0].source.displayName;

                this.magnitudeFormatter = ValueFormatter.create({
                    format: data.values[0].source.format
                });
            }

            if (this.showPebbles) {
                this.eventPoints = new Array<EventPoint>();
            }

            if (this.chartMagnitudes) {
                this.magnitudeThresholds = d3.scale.quantile().domain(magnitudes).range([1, 2.5, 4, 4.5, 5, 5.5, 6, 7, 8, 10]);
            }

            var sortedDates: number[] = dates.map((d) => d.getTime()).sort((n1, n2) => n1 - n2);

            this.dateScale = d3.time.scale()
                .domain([new Date(sortedDates[0]), new Date(sortedDates[sortedDates.length - 1])])
                .range([0, options.viewport.width]).nice();

            var ticks: Date[] = this.dateScale.ticks(10);
            var tickSize: number = ticks[1].getTime() - ticks[0].getTime();


            if (tickSize >= 365 * 86400 * 1000) {
                this.intervalTitle = "year";
            } else if (tickSize >= 27 * 86400 * 1000) {
                this.intervalTitle = "month";
            } else if (tickSize === 7 * 86400 * 1000) {
                this.intervalTitle = "week";
            } else if (tickSize === 86400 * 1000) {
                this.intervalTitle = "day";
            } else {
                this.intervalTitle = "interval";
            }

            var minDate: number = this.dateScale.domain()[0].getTime();
            var maxDate: number = this.dateScale.domain()[1].getTime();

            var slices: number = ticks.length;
            var windowSize: number = (maxDate - minDate) / slices;

            var categories = [];
            var categoryNames = {};

            for (var i = 0; i < groups.length; i++) {
                if (!(groups[i] in categoryNames)) {
                    categoryNames[groups[i]] = categories.length;
                    categories.push(groups[i]);
                }
            }
            this.categories = categories;

            for (var i: number = 0; i < this.categories.length; i++) {
                this.legendData.dataPoints.push({
                    label: this.categories[i],
                    color: colors.getColorByIndex(i).value,
                    icon: LegendIcon.Box,
                    selected: false,
                    identity: SelectionId.createNull()
                });
            }

            this.freq = new Array<Array<number>>(slices);
            for (var x = 0; x < slices; x++) {
                this.freq[x] = new Array<number>(categories.length);
                for (var y = 0; y < categories.length; y++) {
                    this.freq[x][y] = 0;
                }
            }

            for (var i = 0; i < dates.length; i++) {
                var dateTime: number = dates[i].getTime();

                var di: number = Math.floor((dateTime - minDate) / windowSize);
                if (di == slices) { di = slices - 1; }
                var ci: number = categoryNames[groups[i]];
                var m: number = 1;
                if (this.hasMagnitudes) {
                    m = magnitudes[i];
                }

                if (this.showPebbles) {
                    var rx: number = (dateTime - minDate) / (maxDate - minDate);

                    this.eventPoints.push(new EventPoint(rx, ci, m, dates[i]));
                }

                if (this.chartMagnitudes) {
                    this.freq[di][ci] += m;
                } else {
                    this.freq[di][ci] += 1;
                }
            }

            var rfreq: Array<Array<number>> = new Array<Array<number>>(slices);
            for (var x = 0; x < slices; x++) {
                rfreq[x] = new Array<number>(categories.length);
                var sum: number = this.freq[x].reduce((p, c) => p + c);

                if (sum > 0) {
                    for (var y = 0; y < categories.length; y++) {
                        rfreq[x][y] = this.freq[x][y] / sum;
                    }
                } else {
                    if (x == 0) {
                        rfreq[0] = new Array<number>(categories.length);
                        for (var y = 0; y < categories.length; y++) {
                            rfreq[0][y] = 0;
                        }
                    }
                    else {
                        rfreq[x] = rfreq[x - 1];
                    }
                }
            }

            this.streamPoints = new Array<StreamPoint[]>(this.categories.length);

            for (var i: number = 0; i < this.categories.length; i++) {
                this.streamPoints[i] = new Array<StreamPoint>(slices);

                for (var x: number = 0; x < slices; x++) {
                    this.streamPoints[i][x] = { x: x, y: rfreq[x][i] };
                }
            }
        }

        public withinInterval(region: number, x: number) {
            var index: number = Math.floor((x / this.streamsWidth) * this.freq.length);

            return this.freq[index][region];
        }
    }

    export class RelativeVelocity implements IVisual {
        private svg: D3.Selection;
        private gStreams: D3.Selection;
        private legendDiv: D3.Selection;
        private colors: IDataColorPalette;
        private viewModel: VelocityStreamViewModel;
        private legend: ILegend;
        private dataView: DataView;
        private settings: VelocitySettings;

        public init(options: VisualInitOptions): void {
            var baseElement: D3.Selection = d3.select(options.element.get(0));

            this.svg = baseElement.append("svg");

            this.colors = options.style.colorPalette.dataColors;
            this.legend = createLegend(options.element, false, null, false);
        }

        public update(options: VisualUpdateOptions): void {
            this.dataView = options.dataViews[0];
            this.settings = this.parseSettings(options.dataViews[0]);
            this.viewModel = new VelocityStreamViewModel(options, this.colors, this.settings);

            this.svg.attr('width', options.viewport.width);
            this.svg.attr('height', options.viewport.height - this.viewModel.heightLegend);

            this.svg.selectAll("*").remove();

            this.legend.changeOrientation(LegendPosition.Top);
            this.legend.drawLegend(this.viewModel.legendData, options.viewport);

            this.gStreams = this.svg.append("g");

            this.updateStreams();

            var axis: D3.Svg.Axis = d3.svg.axis().scale(this.viewModel.dateScale).orient("bottom");

            this.svg.append("g").classed("axis", true)
                .attr("transform", "translate(0," + this.viewModel.streamsHeight.toString() + ")")
                .call(axis);
        }

        public destroy(): void {
            this.svg = null;
            this.gStreams = null;
            this.legendDiv = null;
            this.colors = null;
            this.viewModel = null;
            this.dataView = null;
            this.legend = null;
            this.settings = null;
        }

        private parseSettings(dataView: DataView): VelocitySettings {
            var settings: VelocitySettings = RelativeVelocity.DefaultVelocitySettings;

            if (dataView) {
                var objects: DataViewObjects = dataView.metadata.objects;

                if (objects) {
                    var general = objects['general'];

                    if (general) {
                        settings.pebbles = <boolean>general['pebbles'];
                    }
                }
            }

            return settings;
        }

        public streamTooltipShow(tooltipComponent: ToolTipComponent, region: number): void {
            var x: number = d3.mouse(this.gStreams.node())[0];
            var rect: controls.TouchUtils.Rectangle = new controls.TouchUtils.Rectangle(d3.event.clientX, d3.event.clientY, 1, 1);
            var items: TooltipDataItem[] = [
                {
                    header: this.viewModel.categories[region],
                    displayName: this.viewModel.dateTitle,
                    value: this.viewModel.dateScale.invert(x).toLocaleDateString()
                },
                {
                    displayName: "per " + this.viewModel.intervalTitle,
                    value: this.viewModel.magnitudeFormatter.format(this.viewModel.withinInterval(region, x))
                }
            ];

            tooltipComponent.show(items, rect);
        }

        public updateStreams(): void {
            this.gStreams.selectAll("*").remove();

            var stack: D3.Layout.StackLayout = d3.layout.stack().offset("expand");
            var layers: StreamPoint[][] = stack(this.viewModel.streamPoints);

            var scaleX: D3.Scale.LinearScale = d3.scale.linear()
                .domain([0, this.viewModel.streamPoints[0].length - 1])
                .range([0, this.viewModel.streamsWidth]);

            var scaleY = (y: number): number => {
                return y * this.viewModel.streamsHeight;
            };

            var area: D3.Svg.Area = d3.svg.area()
                .interpolate('basis')
                .x(d => scaleX(d.x))
                .y0(d => scaleY(d.y0))
                .y1(d => scaleY(d.y0 + d.y));

            var selection: D3.UpdateSelection = this.gStreams.selectAll("region").data(layers);

            selection.enter().append('path').classed("region", true).attr("id", (d, i) => { return "region" + i.toString(); })
                .attr("fill", (d, i) => this.colors.getColorByIndex(i).value).attr("d", area);

            var tooltipComponent: ToolTipComponent = new ToolTipComponent();

            if (!this.viewModel.showPebbles) {
                selection.on("mouseenter", (d, regionIndex) => {
                    this.streamTooltipShow(tooltipComponent, regionIndex);
                }).on("mousemove", (d, regionIndex) => {
                    this.streamTooltipShow(tooltipComponent, regionIndex);
                }).on("mouseleave", (d, i) => {
                    tooltipComponent.hide();
                });
            }

            selection.exit();

            this.viewModel.regionPoints = new Array(layers.length);
            for (var i: number = 0; i < layers.length; i++) {
                var regionPath: SVGPathElement = <SVGPathElement>this.gStreams.select("#region" + i.toString()).node();
                var length: number = regionPath.getTotalLength();

                this.viewModel.regionPoints[i] = new Array(this.viewModel.streamsWidth);
                for (var x: number = 0; x < this.viewModel.streamsWidth; x++) {
                    this.viewModel.regionPoints[i][x] = [];
                }

                for (var t: number = 0; t < length; t += 0.5) {
                    var point: SVGPoint = regionPath.getPointAtLength(t);
                    point.x = Math.round(point.x);
                    point.y = Math.round(point.y);

                    if (point.x < this.viewModel.regionPoints[i].length) {
                        if (this.viewModel.regionPoints[i][point.x].length == 0) {
                            this.viewModel.regionPoints[i][point.x].push(point);
                        } else if (this.viewModel.regionPoints[i][point.x].length == 1
                            && Math.abs(this.viewModel.regionPoints[i][point.x][0].y - point.y) > 5) {
                            this.viewModel.regionPoints[i][point.x].push(point);
                        }
                    }
                }
            }

            // draw pebbles
            if (this.viewModel.showPebbles) {
                var selection: D3.UpdateSelection = this.gStreams.selectAll("pebble").data(this.viewModel.eventPoints);

                selection.enter().append('circle').classed("pebble", true);

                selection.attr("cx", (d) => d.x * this.viewModel.streamsWidth).attr("cy", (d: EventPoint) => {
                    var px: number = Math.floor(d.x * this.viewModel.streamsWidth);
                    px = Math.min(px, this.viewModel.regionPoints[d.category].length - 1);

                    var points: SVGPoint[] = this.viewModel.regionPoints[d.category][px];

                    var maxY: number = Math.max(points[0].y, points[1].y) - 7;
                    var minY: number = Math.min(points[0].y, points[1].y) + 7;

                    return minY + (d.y * (maxY - minY));
                });

                if (this.viewModel.chartMagnitudes) {
                    selection.attr("r", (data: EventPoint): number => { return this.viewModel.magnitudeThresholds(data.magnitude); });
                } else {
                    selection.attr("r", 5);
                }

                var dateFormatter: IValueFormatter = ValueFormatter.create({
                    format: this.dataView.categorical.categories[0].source.format
                });

                if (this.viewModel.hasTitles || this.viewModel.hasMagnitudes) {
                    TooltipManager.addTooltip(selection, (e: TooltipEvent): TooltipDataItem[] => {
                        var data: EventPoint = <EventPoint>e.data; 

                        var items: TooltipDataItem[] = [
                            {
                                displayName: this.viewModel.dateTitle,
                                value: dateFormatter.format(data.date)
                            }
                        ];

                        if (this.viewModel.hasMagnitudes) {
                            items.push({
                                displayName: this.viewModel.magnitudeTitle,
                                value: this.viewModel.magnitudeFormatter.format(data.magnitude)
                            });
                        }

                        return items;
                    });
                }

                if (this.viewModel.doAnimations) {
                    selection.attr("id", (d: EventPoint, i: number): string => {
                        return "pebble" + i.toString();
                    });

                    selection.each((d: EventPoint, i: number): void => {
                        document.getElementById("pebble" + i.toString()).addEventListener("mouseenter", (e: MouseEvent) => {
                            var pebble: Element = e.srcElement;
                            var cx: string = pebble.attributes.getNamedItem("cx").value;
                            var cy: string = pebble.attributes.getNamedItem("cy").value;
                            var r: number = parseInt(pebble.attributes.getNamedItem("r").value);

                            var ripple: D3.Selection = this.gStreams.append("circle").attr("cx", cx).attr("cy", cy).attr("r", r)
                                .attr("stroke", "white").attr("stroke-width", 1.2).attr("fill", "none");

                            var animLength: number = 750;
                            var start: number = new Date().getTime();

                            var anim = () => {
                                var t: number = (new Date().getTime() - start) / animLength;

                                var radius: number = r + t * 10;
                                var opacity: number = 1 - t;

                                if (t >= 1) {
                                    ripple.remove();
                                } else {
                                    ripple.attr("r", radius).attr("opacity", opacity);
                                    window.requestAnimationFrame(anim);
                                }
                            };

                            window.requestAnimationFrame(anim);
                        });
                    });
                }

                selection.exit();
            }
        }

        public static capabilities: VisualCapabilities = {
            dataRoles: [
                {
                    name: "Date",
                    kind: VisualDataRoleKind.Grouping,
                    displayName: 'Date'
                }, {
                    name: "Category",
                    kind: VisualDataRoleKind.Grouping,
                    displayName: data.createDisplayNameGetter("Role_DisplayName_Category")
                }, {
                    name: "Y",
                    kind: VisualDataRoleKind.Measure,
                    displayName: data.createDisplayNameGetter("Role_DisplayName_Value")
                }],
            dataViewMappings: [{
                conditions: [
                    { "Date": { min: 0, max: 1 }, "Category": { min: 0, max: 1 }, "Y": { min: 0, max: 1 } }
                ],
                categorical: {
                    categories: {
                        for: { in: 'Date' },
                        dataReductionAlgorithm: { top: {} }
                    },
                    values: {
                        select: [
                            { bind: { to: 'Category' } },
                            { bind: { to: 'Y' } }
                        ]
                    }
                }
            }],
            objects: {
                general: {
                    displayName: "General",
                    properties: {
                        pebbles: {
                            type: { bool: true },
                            displayName: "Pebbles"
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
                            pebbles: this.settings.pebbles
                        }
                    };

                    instances.push(general);
                    break;
            }

            return instances;
        }

        private static DefaultVelocitySettings: VelocitySettings = {
            pebbles: false
        };
    }
}