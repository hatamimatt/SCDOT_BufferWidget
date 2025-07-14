/** @jsx jsx */
import React, { useState, useEffect, useRef } from 'react'
import { jsx } from 'jimu-core'
import { AllWidgetProps } from 'jimu-core'
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis'
import { Radio, Button, Select, Option, TextInput } from 'jimu-ui'
import GraphicsLayer from 'esri/layers/GraphicsLayer'
import SketchViewModel from 'esri/widgets/Sketch/SketchViewModel'
import SimpleMarkerSymbol from 'esri/symbols/SimpleMarkerSymbol'
import SimpleLineSymbol from 'esri/symbols/SimpleLineSymbol'
import SimpleFillSymbol from 'esri/symbols/SimpleFillSymbol'
import Graphic from 'esri/Graphic'
import geometryEngine from 'esri/geometry/geometryEngine'

const Widget = (props: AllWidgetProps<unknown>) => {
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>(null)
  const [sketchViewModel, setSketchViewModel] = useState<SketchViewModel>(null)
  const [graphicsLayer, setGraphicsLayer] = useState<GraphicsLayer>(null)
  const [geometryType, setGeometryType] = useState<'point' | 'polyline' | 'polygon'>('point')
  const [bufferDistance, setBufferDistance] = useState(100)
  const [bufferUnit, setBufferUnit] = useState<'meters' | 'kilometers' | 'feet' | 'miles'>('meters')

  // Use refs to store the latest bufferDistance and bufferUnit
  // This ensures the create event listener always has access to the current values
  const bufferDistanceRef = useRef(bufferDistance);
  const bufferUnitRef = useRef(bufferUnit);

  useEffect(() => {
    bufferDistanceRef.current = bufferDistance;
  }, [bufferDistance]);

  useEffect(() => {
    bufferUnitRef.current = bufferUnit;
  }, [bufferUnit]);


  useEffect(() => {
    if (jimuMapView && jimuMapView.view) {
      const layer = new GraphicsLayer()
      jimuMapView.view.map.add(layer)
      setGraphicsLayer(layer)

      const sketchVM = new SketchViewModel({
        view: jimuMapView.view,
        layer,
        pointSymbol: new SimpleMarkerSymbol({ style: 'circle', color: [226, 119, 40], size: '12px' }),
        polylineSymbol: new SimpleLineSymbol({ color: [226, 119, 40], width: 2 }),
        polygonSymbol: new SimpleFillSymbol({
          color: [226, 119, 40, 0.4],
          outline: new SimpleLineSymbol({ color: [226, 119, 40], width: 1 }),
        }),
      })

      sketchVM.on('create', (event) => {
        if (event.state === 'complete') {
          // Use the current values from the refs
          const currentBufferDistance = bufferDistanceRef.current;
          const currentBufferUnit = bufferUnitRef.current;

          const buffer = geometryEngine.buffer(event.graphic.geometry, currentBufferDistance, currentBufferUnit)
          if (buffer) {
            const bufferGraphic = new Graphic({
              geometry: buffer,
              symbol: new SimpleFillSymbol({
                color: [0, 0, 255, 0.2],
                outline: new SimpleLineSymbol({ color: [0, 0, 255], width: 1 }),
              }),
            })
            layer.add(bufferGraphic)
            layer.remove(event.graphic) // remove original geometry
          }
          jimuMapView.view.cursor = 'default'
        }
      })

      setSketchViewModel(sketchVM)

      // Cleanup function
      return () => {
        if (sketchVM) {
          sketchVM.destroy();
        }
        if (layer) {
          jimuMapView.view.map.remove(layer);
        }
      };
    }
  }, [jimuMapView]) // Re-run effect only when jimuMapView changes

  const handleDrawClick = () => {
    if (sketchViewModel) {
      sketchViewModel.create(geometryType)
      jimuMapView.view.cursor = 'crosshair'
    }
  }

  const handleClear = () => {
    if (graphicsLayer) {
      graphicsLayer.removeAll()
    }
  }

  const handleSave = () => {
    alert('Buffer graphics saved (for now this is a placeholder).')
  }

  return (
    <div
      className="widget-container"
      style={{
        padding: '1rem',
        borderRadius: '10px',
        backdropFilter: 'blur(10px)',
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
        width: '300px',
      }}
    >
      {!jimuMapView && <div>Please connect this widget to a map using the setting panel.</div>}

      {jimuMapView && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <strong>Select Geometry Type:</strong>
            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
              <label>
                <Radio name="geometry" checked={geometryType === 'point'} onChange={() => setGeometryType('point')} />
                Point
              </label>
              <label>
                <Radio name="geometry" checked={geometryType === 'polyline'} onChange={() => setGeometryType('polyline')} />
                Polyline
              </label>
              <label>
                <Radio name="geometry" checked={geometryType === 'polygon'} onChange={() => setGeometryType('polygon')} />
                Polygon
              </label>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <strong>Buffer Distance:</strong>
            <TextInput
              type="number"
              value={bufferDistance.toString()}
              onChange={(e) => setBufferDistance(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <strong>Buffer Unit:</strong>
            <Select value={bufferUnit} onChange={(e) => setBufferUnit(e.target.value as any)} style={{ width: '100%' }}>
              <Option value="meters">Meters</Option>
              <Option value="kilometers">Kilometers</Option>
              <Option value="feet">Feet</Option>
              <Option value="miles">Miles</Option>
            </Select>
          </div>

          <Button type="primary" onClick={handleDrawClick} style={{ width: '100%', marginBottom: '0.5rem' }}>
            Start Drawing
          </Button>
          <Button onClick={handleSave} style={{ width: '100%', marginBottom: '0.5rem' }}>
            Save Buffer
          </Button>
          <Button type="danger" onClick={handleClear} style={{ width: '100%' }}>
            Clear All
          </Button>
        </>
      )}

      <JimuMapViewComponent
        useMapWidgetId={props.useMapWidgetIds?.[0]}
        onActiveViewChange={(view) => {
          if (view) setJimuMapView(view)
        }}
      />
    </div>
  )
}

export default Widget