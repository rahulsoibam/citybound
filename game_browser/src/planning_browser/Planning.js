import colors from '../colors';

export const initialState = {
    rendering: {
        staticMeshes: {},
        currentPreview: {}
    },
    master: {
        gestures: {}
    },
    proposals: {
    },
    currentProposal: null,
    hoveredGesturePoint: {}
};

// STATE MUTATING ACTIONS

function switchToProposal(proposalId) {
    console.log("switching to", proposalId);

    return oldState => update(oldState, {
        planning: { currentProposal: { $set: proposalId } }
    })
}

function getGestureAsOf(state, proposalId, gestureId) {
    if (proposalId && state.planning.proposals[proposalId]) {
        let proposal = state.planning.proposals[proposalId];
        for (let i = proposal.undoable_history.length - 1; i >= 0; i--) {
            let gestureInStep = proposal.undoable_history[i][gestureId];
            if (gestureInStep) {
                return gestureInStep;
            }
        }
    }
    return state.planning.master.gestures[gestureId];
}

function moveGesturePoint(proposalId, gestureId, pointIdx, newPosition, doneMoving) {
    cityboundBrowser.move_gesture_point(proposalId, gestureId, pointIdx, [newPosition[0], newPosition[1]], doneMoving);

    if (!doneMoving) {

        return oldState => {
            let currentGesture = getGestureAsOf(oldState, proposalId, gestureId);
            let newPoints = [...currentGesture.points];
            newPoints[pointIdx] = newPosition;

            return update(oldState, {
                planning: {
                    proposals: {
                        [proposalId]: {
                            ongoing: {
                                $set: { gestures: { [gestureId]: Object.assign(currentGesture, { points: newPoints }) } }
                            }
                        }
                    }
                }
            })
        }
    } else {
        return s => s
    }
}

function implementProposal(proposalId) {
    cityboundBrowser.implement_proposal(proposalId);
    return oldState => update(oldState, { planning: { $unset: ['currentProposal'] } });
}

// INTERACTABLES AND RENDER LAYERS

export function render(state, setState) {
    const gesturePointInstances = [];
    const gesturePointInteractables = [];

    if (state.planning) {
        let gestures = Object.keys(state.planning.master.gestures).map(gestureId =>
            ({ [gestureId]: Object.assign(state.planning.master.gestures[gestureId], { fromMaster: true }) })
        ).concat(state.planning.currentProposal
            ? state.planning.proposals[state.planning.currentProposal].undoable_history
                .concat([state.planning.proposals[state.planning.currentProposal].ongoing || { gestures: [] }]).map(step => step.gestures)
            : []
        ).reduce((coll, gestures) => Object.assign(coll, gestures), {});

        let { gestureId: hoveredGestureId, pointIdx: hoveredPointIdx } = state.planning.hoveredGesturePoint;

        for (let gestureId of Object.keys(gestures)) {
            const gesture = gestures[gestureId];

            for (let [pointIdx, point] of gesture.points.entries()) {
                let isHovered = gestureId == hoveredGestureId && pointIdx == hoveredPointIdx;
                gesturePointInstances.push.apply(gesturePointInstances, [
                    point[0], point[1], 0,
                    1.0, 0.0,
                    ...(isHovered
                        ? colors.gesturePointHover
                        : (gesture.fromMaster ? colors.gesturePointMaster : colors.gesturePointCurrentProposal))
                ]);

                gesturePointInteractables.push({
                    shape: {
                        type: "circle",
                        center: [point[0], point[1], 0],
                        radius: 3
                    },
                    onEvent: e => {
                        if (e.hover) {
                            if (e.hover.start) {
                                setState(update(state, {
                                    planning: {
                                        hoveredGesturePoint: {
                                            $set: { gestureId, pointIdx }
                                        }
                                    }
                                }))
                            } else if (e.hover.end) {
                                setState(update(state, {
                                    planning: {
                                        hoveredGesturePoint: {
                                            $set: {}
                                        }
                                    }
                                }))
                            }
                        }

                        if (e.drag) {
                            if (e.drag.now) {
                                setState(moveGesturePoint(state.planning.currentProposal, gestureId, pointIdx, e.drag.now, false));
                            } else if (e.drag.end) {
                                setState(moveGesturePoint(state.planning.currentProposal, gestureId, pointIdx, e.drag.end, true));
                            }
                        }
                    }
                })
            }
        }
    }

    const layers = [
        {
            decal: true,
            batches: [{
                mesh: this.state.planning.rendering.currentPreview.lanesToDestruct,
                instances: new Float32Array([0.0, 0.0, 0.0, 1.0, 0.0, ...colors.destructedAsphalt])
            }]
        },
        {
            decal: true,
            batches: [{
                mesh: this.state.planning.rendering.currentPreview.lanesToConstruct,
                instances: new Float32Array([0.0, 0.0, 0.0, 1.0, 0.0, ...colors.plannedAsphalt])
            }]
        },
        {
            decal: true,
            batches: [{
                mesh: this.state.planning.rendering.currentPreview.lanesToConstructMarker,
                instances: new Float32Array([0.0, 0.0, 0.0, 1.0, 0.0, ...colors.plannedRoadMarker])
            }]
        },
        {
            decal: true,
            batches: [{
                mesh: this.state.planning.rendering.currentPreview.switchLanesToConstructMarkerGap,
                instances: new Float32Array([0.0, 0.0, 0.0, 1.0, 0.0, ...colors.plannedAsphalt])
            }]
        },
        {
            decal: true,
            batches: [{
                mesh: state.planning.rendering.staticMeshes.GestureDot,
                instances: new Float32Array(gesturePointInstances)
            }]
        }
    ];

    const elements = EL("div", { key: "proposals", className: "window proposals" }, [
        EL("h1", { key: "heading" }, "Proposals"),
        ...Object.keys(state.planning.proposals).map(proposalId =>
            proposalId == state.planning.currentProposal
                ? EL("p", { key: proposalId }, [
                    "" + proposalId,
                    EL("button", {
                        onClick: () => setState(implementProposal(state.planning.currentProposal))
                    }, "implement")
                ])
                : EL("button", {
                    key: proposalId,
                    onClick: () => setState(switchToProposal(proposalId))
                }, "" + proposalId)
        ),
    ]);

    return [layers, gesturePointInteractables, elements];
}