/** @jsx jsx */
import * as React from 'react';
import { jsx } from 'jimu-core';
import { AllWidgetProps } from 'jimu-core';
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis';
import { Button, Select, TextInput, Checkbox } from 'jimu-ui';
const { Option } = Select;
import GraphicsLayer from 'esri/layers/GraphicsLayer';
import SketchViewModel from 'esri/widgets/Sketch/SketchViewModel';
import SimpleMarkerSymbol from 'esri/symbols/SimpleMarkerSymbol';
import SimpleLineSymbol from 'esri/symbols/SimpleLineSymbol';
import SimpleFillSymbol from 'esri/symbols/SimpleFillSymbol';
import Graphic from 'esri/Graphic';
import geometryEngine from 'esri/geometry/geometryEngine';


// ========================= SVG ICONS ========================= //
const IconPoint = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="black">
    <circle cx="12" cy="12" r="6" />
  </svg>
);

const IconPolyline = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <polyline points="4,4 10,10 18,6" stroke="black" strokeWidth="2" fill="none" />
  </svg>
);

const IconRectangle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
    <rect x="4" y="4" width="16" height="16" />
  </svg>
);

const IconCircle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2">
    <circle cx="12" cy="12" r="8" />
  </svg>
);

const IconPolygon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="black">
    <polygon points="6,4 18,4 20,12 12,20 4,12" />
  </svg>
);


// ========================= MAIN COMPONENT ========================= //
const Widget = (props: AllWidgetProps<unknown>) => {

  const [reportPanelOpen, setReportPanelOpen] = React.useState(false);
  const [layerGroupsState, setLayerGroupsState] = React.useState<{ [key: string]: boolean }>({});
  const [groupedLayers, setGroupedLayers] = React.useState<{ [group: string]: __esri.FeatureLayer[] }>({});

  function getLayerGroup(title: string): string {
    if (title.startsWith("ArchSite_Prod")) return "Cultural Resources";
    return "Others";
  }

  React.useEffect(() => {
    if (jimuMapView?.view?.map) {
      const groups: { [group: string]: __esri.FeatureLayer[] } = {};
      jimuMapView.view.map.layers.forEach((layer) => {
        if (layer.type === "feature") {
          const group = getLayerGroup(layer.title);
          if (!groups[group]) groups[group] = [];
          groups[group].push(layer as __esri.FeatureLayer);
        }
      });
      setGroupedLayers(groups);
      const initChecks: { [group: string]: boolean } = {};
      Object.keys(groups).forEach((group) => {
        initChecks[group] = true;
      });
      setLayerGroupsState(initChecks);
    }
  }, [jimuMapView]);


  const [jimuMapView, setJimuMapView] = React.useState<JimuMapView>(null);
  const [sketchViewModel, setSketchViewModel] = React.useState<SketchViewModel>(null);
  const [graphicsLayer, setGraphicsLayer] = React.useState<GraphicsLayer>(null);
  const [drawMode, setDrawMode] = React.useState<'point' | 'polyline' | 'rectangle' | 'circle' | 'polygon'>('point');
  const [bufferDistance, setBufferDistance] = React.useState(100);
  const [bufferUnit, setBufferUnit] = React.useState<'meters' | 'kilometers' | 'feet' | 'miles'>('meters');
  const [bufferGraphic, setBufferGraphic] = React.useState<Graphic>(null);

  const bufferDistanceRef = React.useRef(bufferDistance);
  const bufferUnitRef = React.useRef(bufferUnit);

  React.useEffect(() => {
    bufferDistanceRef.current = bufferDistance;
  }, [bufferDistance]);

  React.useEffect(() => {
    bufferUnitRef.current = bufferUnit;
  }, [bufferUnit]);

  React.useEffect(() => {
    if (jimuMapView && jimuMapView.view) {
      const view = jimuMapView.view;
      const layer = new GraphicsLayer();
      view.map.add(layer);
      setGraphicsLayer(layer);

      const sketchVM = new SketchViewModel({
        view,
        layer,
        pointSymbol: new SimpleMarkerSymbol({ style: 'circle', color: [226, 119, 40], size: '12px' }),
        polylineSymbol: new SimpleLineSymbol({ color: [226, 119, 40], width: 2 }),
        polygonSymbol: new SimpleFillSymbol({
          color: [226, 119, 40, 0.4],
          outline: new SimpleLineSymbol({ color: [226, 119, 40], width: 1 }),
        }),
      });

      sketchVM.on('create', (event) => {
        if (event.state === 'complete') {
          const view = jimuMapView.view;
          view.popup.autoOpenEnabled = true;
          view.cursor = 'default';

          let resultGeometry = event.graphic.geometry;

          if (drawMode === 'point') {
            resultGeometry = geometryEngine.buffer(
              resultGeometry,
              bufferDistanceRef.current,
              bufferUnitRef.current
            );
          }

          if (resultGeometry) {
            const bufferGfx = new Graphic({
              geometry: resultGeometry,
              symbol: new SimpleFillSymbol({
                color: [0, 0, 255, 0.2],
                outline: new SimpleLineSymbol({ color: [0, 0, 255], width: 1 }),
              }),
            });

            layer.add(bufferGfx);
            setBufferGraphic(bufferGfx);
            layer.remove(event.graphic);
          }
        }
      });

      setSketchViewModel(sketchVM);

      return () => {
        if (sketchVM) sketchVM.destroy();
        if (layer) view.map.remove(layer);
      };
    }
  }, [jimuMapView]);

  const handleDrawClick = () => {
    if (sketchViewModel && jimuMapView) {
      const view = jimuMapView.view;

      if (graphicsLayer && bufferGraphic) {
        graphicsLayer.remove(bufferGraphic);
        setBufferGraphic(null);
      }

      view.popup.autoOpenEnabled = false;
      view.cursor = 'crosshair';

      sketchViewModel.create(drawMode);
    }
  };

  const handleStartOver = () => {
    if (graphicsLayer) {
      graphicsLayer.removeAll();
      setBufferGraphic(null);
    }

    if (jimuMapView?.view) {
      jimuMapView.view.cursor = 'default';
      jimuMapView.view.popup.autoOpenEnabled = true;
    }
  };

  return (
    <div style={{
      height: '100vh',
      overflowY: 'auto',
      fontFamily: 'Segoe UI, sans-serif',
      background: '#fff',
      border: '1px solid #ccc',
      borderRadius: '6px',
      boxShadow: '0 1px 6px rgba(0,0,0,0.2)'
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #ccc' }}>
        {['Place name', 'Draw', 'Shapefile'].map((label, index) => (
          <div key={label}
            style={{
              flex: 1,
              padding: '8px 0',
              textAlign: 'center',
              backgroundColor: label === 'Draw' ? '#f2f2f2' : '#fff',
              fontWeight: label === 'Draw' ? 600 : 400,
              cursor: 'default',
              borderRight: index < 2 ? '1px solid #ccc' : 'none'
            }}>
            {label}
          </div>
        ))}
      </div>

      {jimuMapView ? (
        <div style={{ padding: '12px' }}>
          {/* Draw Mode Buttons */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ marginBottom: '4px' }}>Select draw mode</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <Button icon style={{ width: 40, height: 40 }} onClick={() => setDrawMode('point')} type={drawMode === 'point' ? 'primary' : 'default'}>
                <IconPoint />
              </Button>
              <Button icon style={{ width: 40, height: 40 }} onClick={() => setDrawMode('polyline')} type={drawMode === 'polyline' ? 'primary' : 'default'}>
                <IconPolyline />
              </Button>
              <Button icon style={{ width: 40, height: 40 }} onClick={() => setDrawMode('rectangle')} type={drawMode === 'rectangle' ? 'primary' : 'default'}>
                <IconRectangle />
              </Button>
              <Button icon style={{ width: 40, height: 40 }} onClick={() => setDrawMode('circle')} type={drawMode === 'circle' ? 'primary' : 'default'}>
                <IconCircle />
              </Button>
              <Button icon style={{ width: 40, height: 40 }} onClick={() => setDrawMode('polygon')} type={drawMode === 'polygon' ? 'primary' : 'default'}>
                <IconPolygon />
              </Button>
            </div>
          </div>

          {/* Buffer Section */}
          <div style={{ fontSize: '13px', color: '#444', marginBottom: '0.25rem' }}>Buffer distance (optional)</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
            <TextInput
              type="number"
              value={bufferDistance.toString()}
              onChange={(e) => setBufferDistance(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <Select value={bufferUnit} onChange={(e) => setBufferUnit(e.target.value as any)} style={{ width: '90px' }}>
              <Option value="feet">Feet</Option>
              <Option value="meters">Meters</Option>
              <Option value="kilometers">Kilometers</Option>
              <Option value="miles">Miles</Option>
            </Select>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
            <Button onClick={handleDrawClick} style={{ flex: 1 }}>Draw</Button>
            <Button onClick={() => setReportPanelOpen(true)} style={{ flex: 1 }}>Report</Button>
            <Button onClick={handleStartOver} style={{ flex: 1 }}>Start Over</Button>
          </div>

          {/* Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Checkbox checked />
            <span style={{ marginLeft: '6px' }}>Feasibility Report</span>
          </div>
        </div>
      ) : (
        <div style={{ padding: '1rem' }}>
          Please connect this widget to a map using the setting panel.
        </div>
      )}

      <JimuMapViewComponent
        useMapWidgetId={props.useMapWidgetIds?.[0]}
        onActiveViewChange={(view) => {
          if (view) setJimuMapView(view);
        }}
      />
    
      {reportPanelOpen && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#fff', zIndex: 999, overflowY: 'auto', padding: '1rem' }}>
          <Button onClick={() => setReportPanelOpen(false)} style={{ marginBottom: '1rem' }}>Back</Button>
          <h4>Report Panel</h4>
          {Object.entries(groupedLayers).map(([group, layers]) => (
            <div key={group}>
              <Checkbox
                checked={layerGroupsState[group]}
                onChange={() => setLayerGroupsState(prev => ({ ...prev, [group]: !prev[group] }))}
              />
              <span style={{ marginLeft: '8px' }}>{group}</span>
              <ul>
                {layerGroupsState[group] && layers.map((layer) => (
                  <li key={layer.id}>{layer.title}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};

export default Widget;
