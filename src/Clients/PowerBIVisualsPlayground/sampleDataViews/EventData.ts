/*
*  Power BI Visualizations
*
*  Copyright (c) Microsoft Corporation
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

/// <reference path="../_references.ts"/>

module powerbi.visuals.sampleDataViews {
    import DataViewTransform = powerbi.data.DataViewTransform;

    export class EventData extends SampleDataViews implements ISampleDataViewsMethods {
        public name: string = "EventData";
        public displayName: string = "Event data with titles";

        public visuals: string[] = ["relativeVelocity"];

        private dates: Date[];
        private category: string[];
        private title: string[];
        private magnitude: number[];

        static categoryNames: string[] = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];

        constructor() {
            super();

            var startDate: Date = new Date(2015, 0, 1);
            var endDate: Date = new Date(2016, 0, 0, 0, 0, 0, 0);

            this.dates = new Array(1000);
            this.category = new Array(1000);
            this.title = new Array(1000);
            this.magnitude = new Array<number>(1000);

            for (var i = 0; i < 1000; i++) {
                this.dates[i] = EventData.randomDate(startDate, endDate);
                this.category[i] = EventData.categoryNames[Math.floor((Math.random() * 5))];
                this.title[i] = "title " + (i + 1).toString();
                this.magnitude[i] = Math.round(Math.random() * 1000000);
            }
        }

        public getDataViews(): DataView[] {
            let dataViewMetadata: DataViewMetadata = {
                columns: [
                    {
                        displayName: "Date",
                        queryName: "Stream.Date",
                        type: ValueType.fromDescriptor({ dateTime: true })
                    },
                    {
                        displayName: "Category",
                        queryName: "Stream.Category",
                        type: ValueType.fromDescriptor({ text: true })
                    },
                    {
                        displayName: "Magnitude",
                        queryName: "Stream.Magnitude",
                        type: ValueType.fromDescriptor({ numeric: true })
                    },
                    {
                        displayName: "Title",
                        queryName: "Stream.Title",
                        type: ValueType.fromDescriptor({ text: true })
                    } ]
            };

            return [{
                metadata: dataViewMetadata,
                categorical: {
                    categories: [
                        {
                            source: dataViewMetadata.columns[0],
                            values: this.dates
                        },
                        {
                            source: dataViewMetadata.columns[1],
                            values: this.category
                        }],
                    values: DataViewTransform.createValueColumns([
                        {
                            source: dataViewMetadata.columns[2],
                            values: this.magnitude
                        }, {
                            source: dataViewMetadata.columns[3],
                            values: this.title
                        }
                    ])
                }
            }];
        }

        private static randomDate(start: Date, end: Date): Date {
            return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
        }

        public randomize(): void {
        }
    }
}