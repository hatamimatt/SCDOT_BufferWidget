/** @jsx jsx */
import * as React from 'react';
import { jsx } from 'jimu-core';
import { AllWidgetProps } from 'jimu-core';
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis';
import { Button, Select, Option, TextInput, Checkbox } from 'jimu-ui';
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
  const [jimuMapView, setJimuMapView] = React.useState<JimuMapView>(null);
  const [sketchViewModel, setSketchViewModel] = React.useState<SketchViewModel>(null);
  const [groupNames, setGroupNames] = React.useState<string[]>([]);
  const [layerGroups, setLayerGroups] = React.useState<{ [group: string]: __esri.FeatureLayer[] }>({});

  const [graphicsLayer, setGraphicsLayer] = React.useState<GraphicsLayer>(null);
  const graphicsLayerRef = React.useRef<GraphicsLayer>(null);
  const [drawMode, setDrawMode] = React.useState<'point' | 'polyline' | 'rectangle' | 'circle' | 'polygon'>('point');
  const [bufferDistance, setBufferDistance] = React.useState(100);
  const [bufferUnit, setBufferUnit] = React.useState<'meters' | 'kilometers' | 'feet' | 'miles'>('meters');
  const [bufferGraphic, setBufferGraphic] = React.useState<Graphic>(null);
  const [reportResults, setReportResults] = React.useState<string[]>([]);
  
  
  


  const [activeGroups, setActiveGroups] = React.useState<{ [key: string]: boolean }>(
    groupNames.reduce((acc, g) => ({ ...acc, [g]: true }), {})
  );
  



  

  const bufferDistanceRef = React.useRef(bufferDistance);
  const bufferUnitRef = React.useRef(bufferUnit);

  React.useEffect(() => {
    bufferDistanceRef.current = bufferDistance;
  }, [bufferDistance]);

  React.useEffect(() => {
    bufferUnitRef.current = bufferUnit;
  }, [bufferUnit]);

  React.useEffect(() => {
    if (!jimuMapView?.view) return;

    const view = jimuMapView.view;
    const gLayer = new GraphicsLayer();
    view.map.add(gLayer);
    setGraphicsLayer(gLayer);
    graphicsLayerRef.current = gLayer;

    const sketchVM = new SketchViewModel({
      view,
      layer: gLayer,
      pointSymbol: new SimpleMarkerSymbol({ style: 'circle', color: [226,119,40], size: '12px' }),
      polylineSymbol: new SimpleLineSymbol({ color: [226,119,40], width: 2 }),
      polygonSymbol: new SimpleFillSymbol({ color: [226,119,40,0.4], outline: new SimpleLineSymbol({ color: [226,119,40], width: 1 }) })
    });
    setSketchViewModel(sketchVM);



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

          graphicsLayerRef.current?.add(bufferGfx);
          graphicsLayerRef.current?.remove(event.graphic);
          setBufferGraphic(bufferGfx);
        }
      }
    });


    async function collectFeatureLayers(layer, groups, parentTitle = '') {
      try { await layer.load?.(); } catch { return; }

      if (layer.type === 'feature') {
        const group = parentTitle || 'Ungrouped';
        if (!groups[group]) groups[group] = [];
        groups[group].push(layer);
      } else if (layer.type === 'group' || layer.type === 'map-image') {
        const sublayers = layer.layers?.toArray?.() ?? layer.allSublayers?.toArray?.() ?? [];
        for (const sub of sublayers) await collectFeatureLayers(sub, groups, layer.title);
      }
    }

    const mapLayers = view.map.layers.toArray();
    const groups = {};
    Promise.all(mapLayers.map(layer => collectFeatureLayers(layer, groups))).then(() => {
      setLayerGroups(groups);
      const detected = Object.keys(groups);
      setGroupNames(detected);
      setActiveGroups(detected.reduce((acc, g) => ({ ...acc, [g]: true }), {}));
    });

    return () => {
      sketchVM?.destroy();
      view.map.remove(gLayer);
    };
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

  // Add this function here:
  const handleReportClick = async () => {
    if (!bufferGraphic?.geometry || !jimuMapView) {
      alert("Please draw a buffer area first.");
      return;
    }

    const bufferGeometry = bufferGraphic.geometry;
    const mapLayers = jimuMapView.view.map.layers.toArray();
    console.log("Layers on the map:");
    mapLayers.forEach(l => console.log(`- ${l.title} [${l.type}]`));



    const intersectedLayers = [];
    const checkLayer = async (layer, parentGroup = '') => {
      if (!layer) return;
    
      if (layer.type === 'group') {
        console.log(`📂 Expanding group layer: ${layer.title}`);
        const sublayers = layer.layers?.toArray?.() ?? [];
        for (const sublayer of sublayers) {
          await checkLayer(sublayer, layer.title);
        }
      } else if (layer.type === 'feature') {
        const group = parentGroup || getLayerGroup(layer.title);
    
        if (!activeGroups[group]) {
          console.log(`⛔ Skipping layer ${layer.title} from unchecked group: ${group}`);
          return;
        }
    
        console.log(`✅ Checking layer: ${layer.title} in group: ${group}`);
    
        try {
          const query = layer.createQuery();
          query.geometry = bufferGeometry;
          query.spatialRelationship = 'intersects';
          query.returnGeometry = false;
          query.outFields = ['*'];
    
          const results = await (layer as __esri.FeatureLayer).queryFeatures(query);
          const count = results.features.length;
          console.log(`🔎 ${layer.title} - intersected features: ${count}`);
    
          intersectedLayers.push({
            layerName: layer.title,
            count,
            fields: results.fields.map(f => f.name),
          });
        } catch (error) {
          console.error(`❌ Error querying ${layer.title}`, error);
        }
      } else {
        console.log(`⛔ Skipping non-feature layer: ${layer.title} [${layer.type}]`);
      }
    };
    



    for (const groupName in activeGroups) {
      if (!activeGroups[groupName]) continue;
    
      const layers = layerGroups[groupName] || [];
      for (const layer of layers) {
        await checkLayer(layer, groupName);
      }
    }
    
    if (intersectedLayers.length === 0) {
      setReportResults(["No features intersect with the buffer."]);
    } else {
      const reportText = intersectedLayers.map(layer =>
        `Layer: ${layer.layerName} — Intersected features: ${layer.count}`
      );
      setReportResults(reportText);
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

          {/* Group Layer Selection */}
          <div style={{
            marginBottom: '1rem',
            padding: '10px',
            background: '#f5f5f5',
            border: '1px solid #ddd',
            borderRadius: '6px'
          }}>
            <strong>Report</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '8px' }}>
              {groupNames.map(group => (
                <div key={group} style={{ flex: '0 0 50%', marginBottom: '4px' }}>
                  <Checkbox
                    checked={activeGroups[group]}
                    onChange={(e) =>
                      setActiveGroups({ ...activeGroups, [group]: e.target.checked })
                    }
                  />
                  <span style={{ marginLeft: '6px' }}>{group}</span>
                </div>
              ))}
            </div>
          </div>





          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
            <Button onClick={handleDrawClick} style={{ flex: 1 }}>Draw</Button>
            <Button onClick={handleReportClick} style={{ flex: 1 }}>Report</Button>

            <Button onClick={handleStartOver} style={{ flex: 1 }}>Start Over</Button>
          </div>

          {/* Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Checkbox checked />
            <span style={{ marginLeft: '6px' }}>Feasibility Report</span>
          </div>
          {/* Report Output */}
          {reportResults.length > 0 && (
            <div style={{
              marginTop: '1rem',
              padding: '10px',
              backgroundColor: '#f9f9f9',
              border: '1px solid #ccc',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#333'
            }}>
              <strong>Intersected Layers Report:</strong>
              <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                {reportResults.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            </div>
          )}










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

    </div>
  );
};

export default Widget;
