import React from 'react';
// import logo from './logo.svg';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
// import Login from './Login';
import Navigation from './Navigation';
import SectionText from './SectionText';
import ReferenceBox from './ReferenceBox';
import TranslationBox from './TranslationBox';

// ---- Utility functions

// Is the (span) element a reading?
function isReading(el) {
  return el.classList.contains('reading');
}

// Is the given annotation anchored to the given start and end readings?
function isAnchoredToReadingSpan(annotation, startId, endId) {
  const rdgstart = parseInt(startId.replace('r', ''));
  const rdgend = parseInt(endId.replace('r', ''));
  const beginLink = annotation.links
    .find(x => x.type === 'BEGIN' && x.target === rdgstart);
  const endLink = annotation.links
    .find(x => x.type === 'END' && x.target === rdgend);
  return beginLink && endLink;
}

// Is the given entity anchored to the given annotation (reference)? Return
// the link type if so, otherwise null.
function entityLinkedAs(annotation, refid) {
  const ourLink = annotation.links.find(x => x.target === parseInt(refid));
  return ourLink ? ourLink.type : null;
}


// The main event
class App extends React.Component {
  constructor(props, context) {
    super(props, context);

    this.textLoadHandler = this.textLoadHandler.bind(this);
    this.textSelectHandler = this.textSelectHandler.bind(this);
    this.annotationsAdded = this.annotationsAdded.bind(this);
    this.annotationRemoved = this.annotationRemoved.bind(this);

    this.state = {
      selection: null,
      annotations: [],
      annotationspecs: {},
      sectionList: [],
      loadText: []
    };
  }

  componentDidMount() {
    // Initialise the section list
    fetch('/api/sections')
    .then(response => response.json())
    .then(data => data.hasOwnProperty('error')
      ? Promise.reject(new Error(data.error))
      : this.setState({sectionList: data}))
    .catch(error => alert("Error loading sections! " + error.message));

    // Initialise the annotations list
    fetch('/api/annotations')
    .then(response => response.json())
    .then(data => data.hasOwnProperty('error')
      ? Promise.reject(new Error(data.error))
      : this.setState({annotations: data}))
    .catch(error => alert("Error loading annotations! " + error.message));

    // Initialise the list of annotation labels
    const annotationlabels = {};
    fetch('/api/annotationlabels')
    .then(response => response.json())
    .then(data => {
      if (data.hasOwnProperty('error')) {
        Promise.reject(new Error(data.error));
      }
      data.forEach(x => annotationlabels[x.name.toLowerCase()] = x);
      this.setState({annotationspecs: annotationlabels});
    })
    .catch(error => alert("Error loading annotation specs! " + error.message));
  }

  // Alter the app's state to load the lemma text for the selected section.
  textLoadHandler(sectionId) {
    const url = '/api/section/' + sectionId + '/lemmareadings';
    fetch(url)
    .then(response => response.json())
    .then(data => data.hasOwnProperty('error')
      ? Promise.reject(new Error(data.error))
      : this.setState({loadText: data, selection: null}))
    .catch(error => console.log("Error! " + error));
  }

  textSelectHandler() {
    const sel = window.getSelection();
    if (sel.text !== "") {
      // See if the selection is actually part of the text
      let anchorSpan;
      let targetSpan;
      if (sel.anchorNode.textContent === " " && isReading(sel.anchorNode.nextElementSibling)) {
        anchorSpan = sel.anchorNode.nextElementSibling;
      } else {
        anchorSpan = sel.anchorNode.parentElement;
      }
      if (sel.focusNode.textContent === " " && isReading(sel.focusNode.previousElementSibling)) {
        targetSpan = sel.focusNode.previousElementSibling;
      } else {
        targetSpan = sel.focusNode.parentElement;
      }
      if (isReading(anchorSpan) && isReading(targetSpan)) {
        const newState = {};
        // We will hilight the selected spans and
        // enable buttons to add an annotation
        const startSpan = anchorSpan.compareDocumentPosition(targetSpan)
          & Node.DOCUMENT_POSITION_FOLLOWING
          ? anchorSpan : targetSpan;
        const endSpan = startSpan === anchorSpan ? targetSpan : anchorSpan;
        // First, extend and save the selection we have made
        sel.setBaseAndExtent(startSpan.childNodes[0], 0, endSpan.childNodes[0], endSpan.textContent.length);
        const beginId = startSpan.getAttribute('id');
        const endId = endSpan.getAttribute('id');
        newState.selection = {
          text: sel.toString(),
          start: beginId,
          end: endId
        }
        // Then look up any existing annotation(s) on this selection
        // TODO this assumes that the selection will only have a single reference
        // annotation, though it might link multiple entities.
        const selectionAnnotation = this.state.annotations.find(
          x => isAnchoredToReadingSpan(x, beginId, endId));
        const selectionEntities = {};
        if (selectionAnnotation) {
          this.state.annotations.forEach(x => {
            const link = entityLinkedAs(x, selectionAnnotation.id);
            if (link) {
              selectionEntities[link] = x;
            }
          });
        }
        newState.selectionEntities = selectionEntities;
        this.setState(newState);

        // Then, remove any previous selection
        for (let rspan of document.getElementsByClassName("reading")) {
          rspan.classList.remove("selected");
        }
        // Then get the selected spans
        const selected = [];
        var next = startSpan;
        while(next != null && next.getAttribute("id") !== endSpan.getAttribute("id")) {
          selected.push(next);
          next = next.nextElementSibling;
        }
        selected.push(endSpan);
        selected.forEach( el => el.classList.add("selected"));

        // Finally remove the browser selection marker
        sel.removeAllRanges();
      } else {
        this.setState({selection: null});
      }
    }
  }

  getExisting = annolabel => this.state.annotations.filter(
    x => x.label === annolabel);
  getAnnotationSpec = label => this.state.annotationspecs.hasOwnProperty(label)
    ? this.state.annotationspecs[label] : {};

  annotationsAdded(annolist, doRemoveSelection) {
    // Add the new annotation to our list and reset the state
    const annotations = [...this.state.annotations];
    annolist.forEach( a => {
      // Does it exist?
      const aidx = annotations.findIndex(x => x.id === a.id);
      if (aidx > -1) {
        // Replace it; the links might have updated
        annotations[aidx] = a;
      } else {
        // Add it
        annotations.push(a);
      }
    });
    this.setState({
      selection: doRemoveSelection ? null : this.state.selection,
      annotations: annotations
    });
  }

  annotationRemoved(annotation) {
    // Weed the old annotation out of our list and reset the state
    const remaining = this.state.annotations.filter(x => x.id !== annotation.id);
    if (remaining.length !== this.state.annotations.length) {
      this.setState({annotations: remaining});
    }
  }

  render() {
    return (
      <div>
      <Navigation sections={this.state.sectionList} loadSection={this.textLoadHandler}/>
      <Container id="main">
        <Row>
          <Col md={9}>
            <SectionText
              textSelectHandler={this.textSelectHandler}
              readings={this.state.loadText}
              selection={this.state.selection}
              annotations={this.state.annotations}
            />
          </Col>
          <Col>
            <Container className="sticky-top">
              <Row><Col md={12}>
                <ReferenceBox
                  authority="tla"
                  buttontext="Tag a person"
                  selection={this.state.selection}
                  oldReference={this.state.selectionAnnotation}
                  linkedEntities={this.state.selectionEntities}
                  suggestionList={this.getExisting('PERSON')}
                  annotations={this.state.annotations}
                  spec={this.getAnnotationSpec('person')}
                  refspec={this.getAnnotationSpec('personref')}
                  annotationsAdded={this.annotationsAdded}
                  annotationRemoved={this.annotationRemoved}
                />
              </Col></Row>
              <Row><Col md={12}>
                <ReferenceBox
                  authority="tla"
                  buttontext="Tag a place"
                  selection={this.state.selection}
                  oldReference={this.state.selectionAnnotation}
                  linkedEntities={this.state.selectionEntities}
                  suggestionList={this.getExisting('PLACE')}
                  spec={this.getAnnotationSpec('place')}
                  refspec={this.getAnnotationSpec('placeref')}
                  annotationsAdded={this.annotationsAdded}
                  annotationRemoved={this.annotationRemoved}
                />
              </Col></Row>
              <Row><Col md={12}>
                <ReferenceBox
                  authority="tla"
                  buttontext="Tag a date"
                  selection={this.state.selection}
                  oldReference={this.state.selectionAnnotation}
                  linkedEntities={this.state.selectionEntities}
                  suggestionList={this.getExisting('DATE')}
                  annotations={this.state.annotations}
                  spec={this.getAnnotationSpec('date')}
                  refspec={this.getAnnotationSpec('dateref')}
                  annotationsAdded={this.annotationsAdded}
                  annotationRemoved={this.annotationRemoved}
                />
              </Col></Row>
              <Row><Col md={12}>
                <ReferenceBox
                  authority="tla"
                  buttontext="Date an episode"
                  selection={this.state.selection}
                  oldReference={this.state.selectionAnnotation}
                  linkedEntities={this.state.selectionEntities}
                  suggestionList={this.getExisting('DATE')}
                  annotations={this.state.annotations}
                  spec={this.getAnnotationSpec('date')}
                  refspec={this.getAnnotationSpec('dating')}
                  annotationsAdded={this.annotationsAdded}
                  annotationRemoved={this.annotationRemoved}
                />
              </Col></Row>
              <Row><Col md={12}>
                <TranslationBox
                  selection={this.state.selection}
                  annotations={this.state.annotations}
                  annotationsAdded={this.annotationsAdded}
                  annotationRemoved={this.annotationRemoved}
                />
              </Col></Row>
            </Container>
          </Col>
        </Row>
      </Container>
      </div>
    );
  }
}

export default App;
